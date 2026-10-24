// The relay's agent registry (contract 5.4, D2): one JSON file, one writer. Every change is
// write-temp + fsync + rename + fsync-dir, so a crash leaves the old file or the new one, never half.
// Synchronous on purpose: at most 64 small records, and "persist, then drop the link" must be ordered.
//
// A malformed file stops the start (StoreError naming the file) instead of starting empty: an empty
// registry silently un-pairs everyone, which is a failure to see, not to hide. No backups are made:
// a restored copy would bring revoked agents back.
//
// Caveat: if a revoke cannot be written, the in-memory record is gone but the file still holds it,
// so a restart before a retry revives that agent. `remove` reports persisted:false so the caller can
// keep a revoked set and tell the owner to retry. `last_seen_at` is written at most once per 600 s
// per agent, so an offline agent's last-seen can lag by that much; online state comes from live links.

import * as nodeFs from 'node:fs';
import { dirname, join } from 'node:path';

export const MAX_AGENT_RECORDS = 64;
export const LAST_SEEN_WRITE_INTERVAL_MS = 600_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;
export const OS_USER_RE = /^[A-Za-z0-9._-]{1,32}$/;
export const PLATFORM_RE = /^(linux|darwin|win32)-(x64|arm64)$/;
const AGENT_ID_RE = /^[A-Z2-7]{26}$/;
const FINGERPRINT_RE = /^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/;

export class StoreError extends Error {
	constructor(message) {
		super(message);
		this.name = 'StoreError';
	}
}

const isRawKey = (value) => typeof value === 'string' && Buffer.from(value, 'base64url').length === 32;
const isIsoOrNull = (value) => value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));

function isValidRecord(r) {
	return r !== null && typeof r === 'object'
		&& AGENT_ID_RE.test(r.agent_id) && UUID_RE.test(r.sub) && isRawKey(r.pubkey) && FINGERPRINT_RE.test(r.fp)
		&& typeof r.name === 'string' && NAME_RE.test(r.name)
		&& typeof r.os_user === 'string' && OS_USER_RE.test(r.os_user) && PLATFORM_RE.test(r.platform)
		&& isIsoOrNull(r.created_at) && isIsoOrNull(r.rotated_at) && isIsoOrNull(r.last_seen_at);
}

function load(path, fs) {
	let text;
	try { text = fs.readFileSync(path, 'utf8'); } catch (error) {
		if (error.code === 'ENOENT') return new Map();
		throw new StoreError(`cannot read ${path}: ${error.message}`);
	}
	let parsed;
	try { parsed = JSON.parse(text); } catch { throw new StoreError(`${path} is not valid JSON`); }
	if (parsed?.v !== 1 || !Array.isArray(parsed.agents)) throw new StoreError(`${path} is not a v1 registry`);
	const records = new Map();
	for (const entry of parsed.agents) {
		if (!isValidRecord(entry) || records.has(entry.agent_id)) throw new StoreError(`${path} holds a malformed or duplicate record`);
		records.set(entry.agent_id, entry);
	}
	return records;
}

function writeAtomically(path, records, fs) {
	fs.mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const temp = join(dirname(path), `.agents.${process.pid}.tmp`);
	const fd = fs.openSync(temp, 'w', 0o600);
	try {
		fs.writeFileSync(fd, JSON.stringify({ v: 1, agents: [...records.values()] }));
		fs.fsyncSync(fd);
	} finally { fs.closeSync(fd); }
	try {
		fs.renameSync(temp, path);
	} catch (error) {
		try { fs.unlinkSync(temp); } catch { /* the temp may not exist */ }
		throw error;
	}
	const dirFd = fs.openSync(dirname(path), 'r');
	try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
}

/** `path` comes from configuration (OSIONOS_IDE_RELAY_STORE); `fsImpl` and `now` are test seams. */
export function openAgentStore({ path, fsImpl = nodeFs, now = Date.now }) {
	const records = load(path, fsImpl);
	const lastWriteMs = new Map();
	const persist = () => writeAtomically(path, records, fsImpl);

	// Memory changes first so `persist` sees them; a failed write undoes them, so what the relay
	// serves never runs ahead of what survives a restart.
	function commit(mutate, undo) {
		mutate();
		try { persist(); } catch (error) { undo(); throw error; }
	}

	return {
		list: () => [...records.values()],
		get: (agentId) => records.get(agentId),
		forSub: (sub) => [...records.values()].filter((r) => r.sub === sub),
		countFor: (sub) => [...records.values()].filter((r) => r.sub === sub).length,
		add(record) {
			if (!isValidRecord(record)) throw new StoreError('refusing a malformed record');
			if (records.has(record.agent_id)) throw new StoreError('agent already exists');
			if (records.size >= MAX_AGENT_RECORDS) throw new StoreError('registry is full');
			commit(() => records.set(record.agent_id, record), () => records.delete(record.agent_id));
			return record;
		},
		rotate(agentId, { pubkey, fp, at }) {
			const before = records.get(agentId);
			if (!before) throw new StoreError('unknown agent');
			const rotated = { ...before, pubkey, fp, rotated_at: at };
			if (!isValidRecord(rotated)) throw new StoreError('refusing a malformed rotation');
			commit(() => records.set(agentId, rotated), () => records.set(agentId, before));
		},
		remove(agentId) {
			const before = records.get(agentId);
			if (!before) return { removed: false, persisted: true };
			records.delete(agentId);
			try { persist(); } catch { return { removed: true, persisted: false }; }
			return { removed: true, persisted: true };
		},
		touchSeen(agentId) {
			const before = records.get(agentId);
			if (!before) return;
			const stamp = new Date(now()).toISOString();
			records.set(agentId, { ...before, last_seen_at: stamp });
			const last = lastWriteMs.get(agentId) ?? -Infinity;
			if (now() - last < LAST_SEEN_WRITE_INTERVAL_MS) return;
			lastWriteMs.set(agentId, now());
			try { persist(); } catch { /* best effort: presence must never break a connect */ }
		},
	};
}
