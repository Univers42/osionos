/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   remembered-computers.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The computers this node remembers (devil verdict 2026-11-01, Amendment 1, R4, R7, R8; groot ADR
// 0041, R5 overridden: production and the beta). A device secret is half of a remembered open: it
// opens a shell only beside a fresh resume assertion (R1, pty-service.mjs). The file holds only its
// sha256, bound to the owner, this machine and the app origin it was issued to; a record of another
// owner or machine (a re-pair) or an origin no longer in --remember-origin is deleted on load.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';

import { assertPrivateFile, assertPrivateFolder, writePrivateFile } from './private-file.mjs';

const DAY_MS = 86_400_000;
// Caveat: both windows run on this machine's wall clock; setting it back keeps a record alive past
// its 30 or 90 days, setting it forward expires records early (the person then gets a step-up).
export const REMEMBER_LIMITS = Object.freeze({ maxRecords: 8, idleMs: 30 * DAY_MS, absoluteMs: 90 * DAY_MS });
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const HASH = /^[0-9a-f]{64}$/;

const hashOf = (secret) => createHash('sha256').update(secret).digest('hex');

const isRecord = (value) => value !== null && typeof value === 'object' && HASH.test(value.hash ?? '')
	&& typeof value.owner === 'string' && typeof value.machine === 'string' && typeof value.appOrigin === 'string'
	&& Number.isSafeInteger(value.createdAt) && Number.isSafeInteger(value.lastUsedAt);

// A file that is missing, unreadable, corrupt or not private remembers nothing (R11): the person
// gets today's step-up, never an error.
function readRecords(file) {
	try {
		if (!existsSync(file)) return [];
		assertPrivateFolder(dirname(file));
		assertPrivateFile(file);
		const computers = JSON.parse(readFileSync(file, 'utf8'))?.computers;
		return Array.isArray(computers) ? computers.filter(isRecord) : [];
	} catch {
		return [];
	}
}

export function createRememberedComputers({ file, owner, machine, origins, now = Date.now, newSecret = () => randomBytes(32).toString('base64url') }) {
	const allowed = new Set(origins);
	const records = new Map();
	const isLive = (record, at) => at - record.lastUsedAt <= REMEMBER_LIMITS.idleMs && at - record.createdAt <= REMEMBER_LIMITS.absoluteMs;

	function save() {
		if (records.size === 0) return rmSync(file, { force: true });
		writePrivateFile(file, `${JSON.stringify({ computers: [...records.values()] }, null, 2)}\n`);
	}

	const stored = readRecords(file);
	for (const record of stored) {
		if (record.owner === owner && record.machine === machine && allowed.has(record.appOrigin) && isLive(record, now())) records.set(record.hash, record);
	}
	if (records.size !== stored.length) save();

	/** A new device secret for `appOrigin`, or null when that origin is not one to remember (R5). */
	function issue(appOrigin) {
		if (!allowed.has(appOrigin)) return null;
		const secret = newSecret();
		const at = now();
		records.set(hashOf(secret), { hash: hashOf(secret), owner, machine, appOrigin, createdAt: at, lastUsedAt: at });
		while (records.size > REMEMBER_LIMITS.maxRecords) {
			const oldest = [...records.values()].reduce((left, right) => (right.createdAt < left.createdAt ? right : left));
			records.delete(oldest.hash);
		}
		save();
		return secret;
	}

	/** Whether `secret` is a live record issued to `appOrigin`; a use slides its idle window. */
	function open(secret, appOrigin) {
		if (typeof secret !== 'string' || !SECRET.test(secret)) return false;
		const record = records.get(hashOf(secret));
		if (!record || record.appOrigin !== appOrigin) return false;
		const at = now();
		if (!isLive(record, at)) {
			records.delete(record.hash);
			save();
			return false;
		}
		record.lastUsedAt = at;
		save();
		return true;
	}

	function forget(secret) {
		if (typeof secret === 'string' && records.delete(hashOf(secret))) save();
	}

	function clear() {
		records.clear();
		rmSync(file, { force: true });
	}

	return { issue, open, forget, clear, count: () => records.size };
}
