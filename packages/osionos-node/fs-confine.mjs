/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fs-confine.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Where a path under a root lands on disk (devil verdict 2026-11-01 editor on disk, F8, F9; groot ADR
// 0044). Every op resolves its target, or for a create or a link its parent, with realpath, and the
// result must be the root or under `root + '/'`. This is no boundary against whoever controls the
// editor page, which already has a shell: it keeps a cloned repo's symlink to ~/.ssh or ~/.osionos
// out of an editor bug's reach.
// Caveat: hard links are invisible to realpath, so a hard link inside a root to a file outside it
// is read and written in place (a save replaces the link with a regular file, see fs-ops.mjs).
// Caveat: a same-user process can swap a path component between this realpath and the open that
// follows it; that process already has the user's rights, so the race grants it nothing new.
import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, sep } from 'node:path';

import { fsFail } from './fs-errors.mjs';

/** Whether `path` is `root` or under it. Both are realpaths. */
export function isInside(root, path) {
	return path === root || path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);
}

async function realOrFail(path) {
	try { return await realpath(path); } catch (error) { throw fsFail(error); }
}

/** The target, symlinks followed: what read, write, list and watch act on. */
export async function resolveTarget(root, rel) {
	const real = await realOrFail(join(root, rel));
	if (!isInside(root, real)) throw fsFail('PermissionDenied');
	return real;
}

/** The entry itself, not followed: what create, delete and rename act on. Its parent is resolved. */
export async function resolveEntry(root, rel) {
	if (rel === '') throw fsFail('PermissionDenied');
	const parent = await realOrFail(join(root, dirname(rel)));
	if (!isInside(root, parent)) throw fsFail('PermissionDenied');
	return join(parent, basename(rel));
}

/** Why `dir` cannot be a root, or null. `dir` is already a realpath. */
export async function rootRefusal(dir, { home, nodeHome }) {
	const realHome = await realpath(home).catch(() => home);
	const realNode = await realpath(nodeHome).catch(() => nodeHome);
	if (dir === sep || isInside(dir, realHome)) return 'your home folder or a folder above it';
	if (isInside(dir, realNode) || isInside(realNode, dir)) return 'osionos Connector\'s own folder';
	const info = await stat(dir).catch(() => null);
	return info?.isDirectory() ? null : 'not a folder';
}
