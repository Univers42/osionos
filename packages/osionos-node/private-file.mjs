/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   private-file.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The files of ~/.osionos that hold who may open this machine: owned by this user, in a folder no
// one else may write, readable by no one else, and never seen half-written. Windows has no uid:
// the owner check is skipped there.
import { chmodSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';

function assertPrivate(path, forbiddenBits, problem) {
	const stat = statSync(path);
	const uid = process.getuid?.();
	if (uid !== undefined && stat.uid !== uid) throw new Error(`${path} belongs to another user; refusing it`);
	if (stat.mode & forbiddenBits) throw new Error(`${path} is ${problem}`);
}
export const assertPrivateFolder = (folder) => assertPrivate(folder, 0o022, 'writable by others; chmod 700 it');
export const assertPrivateFile = (file) => assertPrivate(file, 0o077, 'readable or writable by others; chmod 600 it or pair again');

/**
 * Written to a fresh 0600 temp file (`wx`: never through a name someone planted) and renamed, so
 * no reader ever sees it partial or world-readable.
 */
export function writePrivateFile(file, text) {
	const folder = dirname(file);
	mkdirSync(folder, { recursive: true, mode: 0o700 });
	// An existing ~/.osionos of ours made by an older install (0775) is tightened, never trusted as is.
	if (statSync(folder).uid === process.getuid?.()) chmodSync(folder, 0o700);
	assertPrivateFolder(folder);
	const temp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
	writeFileSync(temp, text, { mode: 0o600, flag: 'wx' });
	renameSync(temp, file);
}
