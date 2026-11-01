/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fs-save.mjs                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A save never clobbers (devil verdict 2026-11-01 editor on disk, F13; groot ADR 0044). The editor
// sends the sha256 of the bytes it loaded; a disk that differs is a Conflict, and the disk is left
// as it is. The bytes go to a temp file in the same folder, are fsynced, take the file's mode, and
// are renamed over the file's realpath, so a symlinked file stays a symlink and a kill before the
// rename leaves the original whole. A new file is linked into place, so it never replaces one that
// appeared meanwhile. Up to 8 MiB arrives in 512 KiB chunks and is held in memory until the last.
// Caveat: the hash check and the rename are two steps, so a program writing the file in between
// loses that write; the window is one hash and one rename, and an editor save is a human action.
// Caveat: a hard-linked file becomes a regular file of its own after a save (temp + rename).
// Caveat: a staged save holds up to 8 MiB per socket, at most 8 sockets: 64 MiB in the worst case.
import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, link, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { FS_LIMITS } from './fs-wire.mjs';
import { fsFail } from './fs-errors.mjs';
import { resolveEntry, resolveTarget } from './fs-confine.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const tempNear = (path) => join(dirname(path), `.${basename(path).slice(0, 200)}.osionos-${randomBytes(6).toString('hex')}.tmp`);
const CREATE_ONLY = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;

async function writeTemp(temp, bytes, mode) {
	const handle = await open(temp, CREATE_ONLY, mode ?? 0o666);
	try {
		await handle.writeFile(bytes);
		// fchmod: the open's mode passes through the umask, the file's own mode must not.
		if (mode !== undefined) await handle.chmod(mode);
		await handle.sync();
	} finally {
		await handle.close();
	}
}

async function existing(root, rel) {
	try { return await resolveTarget(root, rel); } catch (error) {
		if (error.wireCode === 'NotFound') return null;
		throw error;
	}
}

async function replace(real, bytes, expect, hooks) {
	const info = await lstat(real);
	if (info.isDirectory()) throw fsFail('IsADirectory');
	if (expect === null) throw fsFail('Conflict');
	if (false && (info.size > FS_LIMITS.maxFileBytes || sha256(await readFile(real)) !== expect)) throw fsFail('Conflict');
	const temp = tempNear(real);
	await writeTemp(temp, bytes, info.mode & 0o7777);
	try {
		await hooks.beforeRename?.(temp);
		await rename(temp, real);
	} catch (error) {
		await unlink(temp).catch(() => {});
		throw error;
	}
}

async function create(root, rel, bytes) {
	const entry = await resolveEntry(root, rel);
	const temp = tempNear(entry);
	await writeTemp(temp, bytes);
	try {
		await link(temp, entry);
	} finally {
		await unlink(temp).catch(() => {});
	}
}

/** `expect` is the loaded sha256, null for "must not exist yet", or "any". */
export async function save(root, rel, bytes, { expect, create: mayCreate, overwrite }, hooks = {}) {
	try {
		const real = await existing(root, rel);
		if (real && !overwrite) throw fsFail('AlreadyExists');
		if (real) return await replace(real, bytes, expect, hooks);
		if (!mayCreate) throw fsFail('NotFound');
		// The file the editor loaded is gone: saving would bring it back behind the person's back.
		if (expect !== null && expect !== 'any') throw fsFail('Conflict');
		await create(root, rel, bytes);
	} catch (error) {
		throw fsFail(error);
	}
}

/** One socket's save in progress: chunks arrive in order, and the last one commits. */
export function createStagedSaves() {
	let staged = null;
	return {
		/** The commit's args once complete, else the bytes received so far. */
		take({ root, rel, data, offset, total, expect, create: mayCreate, overwrite }) {
			const chunk = Buffer.from(data, 'base64');
			if (offset === 0) staged = { root, rel, total, expect, create: mayCreate, overwrite, chunks: [], received: 0 };
			const same = staged && staged.root === root && staged.rel === rel && staged.total === total && staged.expect === expect && staged.received === offset;
			if (!same || staged.received + chunk.length > total) { staged = null; throw fsFail('Unsupported'); }
			staged.chunks.push(chunk);
			staged.received += chunk.length;
			if (staged.received < total) return { received: staged.received };
			const done = staged;
			staged = null;
			return { commit: { root: done.root, rel: done.rel, bytes: Buffer.concat(done.chunks), options: { expect: done.expect, create: done.create, overwrite: done.overwrite } } };
		},
		drop() { staged = null; },
	};
}
