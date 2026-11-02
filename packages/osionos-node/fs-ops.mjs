/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fs-ops.mjs                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The editor page's reads and moves on disk (devil verdict 2026-11-01 editor on disk, F8, F10, F11,
// F15; groot ADR 0044). Async fs only: a sync call would hold the node's one thread, shells included.
// Every path is resolved under its root first (fs-confine.mjs). Saving lives in fs-save.mjs.
import { constants } from 'node:fs';
import { lstat, mkdir as makeDir, open, opendir, rename as move, rm, rmdir, stat as statPath, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { FS_LIMITS } from './fs-wire.mjs';
import { fsFail } from './fs-errors.mjs';
import { isInside, resolveEntry, resolveTarget } from './fs-confine.mjs';

const kindOf = (info) => (info.isFile() ? 'file' : info.isDirectory() ? 'dir' : info.isSymbolicLink() ? 'symlink' : 'other');

// A symlink is shown as what it points to when that is inside the root, else as a symlink the
// editor does not open (F8).
async function linkKind(root, path) {
	try {
		const real = await resolveTarget(root, path.slice(root.length + 1));
		return kindOf(await statPath(real));
	} catch {
		return 'symlink';
	}
}

/** The first `max` entries in directory order, then sorted by name.
 *  Caveat: a truncated listing is the first `max` the kernel returned, not the first `max` by name;
 *  the rest exist on disk and are reached through the terminal. */
async function readEntries(root, dir, max, keep) {
	let handle;
	try { handle = await opendir(dir, { bufferSize: 256 }); } catch (error) { throw fsFail(error); }
	const entries = [];
	let truncated = false;
	try {
		for await (const dirent of handle) {
			const kind = dirent.isSymbolicLink() ? await linkKind(root, join(dir, dirent.name)) : kindOf(dirent);
			if (!keep(dirent.name, kind)) continue;
			if (entries.length === max) { truncated = true; break; }
			entries.push({ name: dirent.name, kind });
		}
	} catch (error) {
		throw fsFail(error);
	}
	// for-await closes the handle itself when the loop runs to its end or breaks.
	entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	return { entries, truncated };
}

export async function list(root, rel) {
	return readEntries(root, await resolveTarget(root, rel), FS_LIMITS.maxListEntries, () => true);
}

/** Folders only under $HOME, no files, sizes or times (F10); dot-folders when the person asks. */
export async function pick(home, rel, hidden) {
	const { entries, truncated } = await readEntries(home, await resolveTarget(home, rel), FS_LIMITS.maxPickEntries, (name, kind) => kind === 'dir' && (hidden || !name.startsWith('.')));
	return { dirs: entries.map((entry) => entry.name), truncated };
}

export async function stat(root, rel) {
	try {
		const info = await statPath(await resolveTarget(root, rel));
		return { kind: kindOf(info), size: info.size, mtimeMs: Math.floor(info.mtimeMs) };
	} catch (error) {
		throw fsFail(error);
	}
}

/** One slice of a file of at most 8 MiB (F11). The open does not follow: the path is already real. */
export async function read(root, rel, offset, length) {
	const real = await resolveTarget(root, rel);
	let handle;
	try { handle = await open(real, constants.O_RDONLY | constants.O_NOFOLLOW); } catch (error) { throw fsFail(error); }
	try {
		const info = await handle.stat();
		if (info.isDirectory()) throw fsFail('IsADirectory');
		if (info.size > FS_LIMITS.maxFileBytes) throw fsFail('TooLarge');
		const want = Math.max(0, Math.min(length, info.size - offset));
		const buffer = Buffer.alloc(want);
		const { bytesRead } = want > 0 ? await handle.read(buffer, 0, want, offset) : { bytesRead: 0 };
		return { data: buffer.subarray(0, bytesRead).toString('base64'), size: info.size, mtimeMs: Math.floor(info.mtimeMs) };
	} catch (error) {
		throw fsFail(error);
	} finally {
		await handle.close();
	}
}

export async function mkdir(root, rel) {
	try { await makeDir(await resolveEntry(root, rel)); } catch (error) { throw fsFail(error); }
}

export async function rename(root, rel, to, overwrite) {
	const from = await resolveEntry(root, rel);
	const target = await resolveEntry(root, to);
	if (isInside(from, target) && from !== target) throw fsFail('Unsupported');
	// Caveat: the no-overwrite check and the rename are two steps; a file created between them by
	// another program is replaced. rename(2) has no portable no-replace flag in node.
	if (!overwrite && await lstat(target).then(() => true, () => false)) throw fsFail('AlreadyExists');
	try { await move(from, target); } catch (error) { throw fsFail(error); }
}

/** A symlink is unlinked, never followed; a recursive delete never descends through one (F15). */
export async function remove(root, rel, recursive) {
	const entry = await resolveEntry(root, rel);
	try {
		const info = await lstat(entry);
		if (!info.isDirectory()) return await unlink(entry);
		if (!recursive) return await rmdir(entry);
		await rm(entry, { recursive: true, force: false });
	} catch (error) {
		throw fsFail(error);
	}
}
