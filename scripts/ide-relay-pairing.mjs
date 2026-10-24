// Device-code pairing (contract 4): the agent starts, the owner claims and confirms in the browser,
// the agent accepts with a signature over the owner's subject tag, and only then does a record exist.
// Pure state plus an injected clock and store: the HTTP glue lives in the relay entry.
//
// Pending entries are memory-only and keyed by hashes, so neither the code nor the pair_id sits in
// the process in clear after issue. A restart forgets every pending pairing (the agent starts again).
//
// Caveat: limits are per process and the per-client key is only as good as the `ip` the caller
// passes (a /24 or /48 prefix, or none behind Funnel, where one global key of 20 starts per 600 s
// applies and one caller can starve the others, the safe direction). Code entropy is 8 letters
// from 20, about 34 bits, bounded by the 5 failed lookups per sub per 600 s, not by size alone.

import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createSlidingLimiter } from './ide-relay-limits.mjs';
import { NAME_RE, OS_USER_RE, PLATFORM_RE } from './ide-relay-store.mjs';
import {
	acceptMessage, b64url, fingerprint, fromB64url, newAgentId, pairMessage, subjectTag, verifyMessage,
} from './ide-agent-frames.mjs';

const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ]{8}$/;
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}(-[A-Za-z0-9.]{1,16})?$/;
const LIFE_MS = 300_000;
const POLL_INTERVAL_MS = 5_000;
const SKEW_MS = 120_000;
const WINDOW_MS = 600_000;
const MAX_AGENTS_PER_SUB = 3;

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const reply = (status, body) => ({ status, body });
const normalizeCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z]/g, '');
const formatCode = (raw) => `${raw.slice(0, 4)}-${raw.slice(4)}`;
const randomCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

function validStart(body) {
	if (body === null || typeof body !== 'object') return null;
	const { pubkey, name, os_user: osUser, platform, version, ts, sig } = body;
	const raw = typeof pubkey === 'string' ? fromB64url(pubkey) : null;
	const ok = raw?.length === 32 && b64url(raw) === pubkey
		&& typeof name === 'string' && NAME_RE.test(name) && typeof osUser === 'string' && OS_USER_RE.test(osUser)
		&& PLATFORM_RE.test(platform) && typeof version === 'string' && VERSION_RE.test(version)
		&& Number.isFinite(ts) && typeof sig === 'string';
	return ok ? { raw, pubkey, name, osUser, platform, version, ts, sig } : null;
}

/** `store` is an openAgentStore; `audit` is createAudit's function; `now` is a clock in ms. */
export function createPairing({ store, origin, now = Date.now, audit, maxPending = 20, globalStarts = 20 }) {
	const pending = new Map(); // sha256(pair_id) -> entry
	const byCode = new Map(); // sha256(code) -> sha256(pair_id)
	const startsPerClient = createSlidingLimiter({ limit: 5, windowMs: WINDOW_MS, now });
	const startsGlobal = createSlidingLimiter({ limit: globalStarts, windowMs: WINDOW_MS, now });
	const lookupsPerSub = createSlidingLimiter({ limit: 10, windowMs: WINDOW_MS, now });
	const failuresPerSub = createSlidingLimiter({ limit: 5, windowMs: WINDOW_MS, now });
	const isExpired = (entry) => now() - entry.startedAt > LIFE_MS;
	const tag = (entry) => entry.key.slice(0, 8);

	function drop(entry) {
		pending.delete(entry.key);
		byCode.delete(entry.codeKey);
	}
	function sweep() {
		for (const entry of [...pending.values()]) if (isExpired(entry)) drop(entry);
	}
	function liveByPairId(pairId) {
		const entry = typeof pairId === 'string' ? pending.get(sha256(pairId)) : undefined;
		return entry && !isExpired(entry) ? entry : undefined;
	}
	const confirmedFor = (sub, except) => [...pending.values()].filter((e) => e.sub === sub && e !== except && !isExpired(e)).length;
	const holdings = (sub, except) => store.countFor(sub) + confirmedFor(sub, except);

	function admitStart({ ip }) {
		if (ip && !startsPerClient.take(ip)) return false;
		return startsGlobal.take('global');
	}
	function refuseStart(fields, status, httpStatus, ip) {
		audit('pair_start', { ...fields, ip, status });
		return reply(httpStatus, { error: status });
	}
	function issue(fields, ip) {
		let raw = randomCode();
		while (byCode.has(sha256(raw))) raw = randomCode();
		const pairId = b64url(randomBytes(32));
		const entry = {
			key: sha256(pairId), codeKey: sha256(raw), startedAt: now(), lastPollAt: -Infinity, sub: null, username: null,
			agentIp: ip ?? null, fp: fingerprint(fields.raw), ...fields,
		};
		pending.set(entry.key, entry);
		byCode.set(entry.codeKey, entry.key);
		audit('pair_start', { pair: tag(entry), fp: entry.fp, platform: entry.platform, version: entry.version, ip, status: 'ok' });
		return reply(201, { pair_id: pairId, user_code: formatCode(raw), expires_in: LIFE_MS / 1000, interval: POLL_INTERVAL_MS / 1000 });
	}
	function start(body, { ip } = {}) {
		sweep();
		const fields = validStart(body);
		if (!fields) return reply(400, { error: 'bad request' });
		if (!admitStart({ ip })) return refuseStart({}, 'limited', 429, ip);
		if (Math.abs(now() - fields.ts) > SKEW_MS) return refuseStart({}, 'skew', 400, ip);
		const signed = pairMessage({ origin, pubkey: fields.pubkey, name: fields.name, ts: fields.ts });
		if (!verifyMessage(fields.raw, signed, fields.sig)) return refuseStart({}, 'bad-sig', 400, ip);
		if (pending.size >= maxPending) return refuseStart({}, 'full', 503, ip);
		return issue(fields, ip);
	}

	// Refuses before looking: a sub that already burned its failures learns nothing from a good guess.
	function lookup({ sub, code, op }) {
		const subj = subjectTag(sub);
		if (!failuresPerSub.peek(sub) || !lookupsPerSub.take(sub)) {
			audit(op, { subj, status: 'limited' });
			return { refusal: reply(429, { error: 'too many attempts' }) };
		}
		const raw = normalizeCode(code);
		const entry = CODE_RE.test(raw) ? findByCode(raw) : undefined;
		if (!entry) {
			failuresPerSub.record(sub);
			audit(op, { subj, status: 'not-found' });
			return { refusal: reply(404, { error: 'not found' }) };
		}
		return { entry, subj };
	}
	function findByCode(raw) {
		const entry = pending.get(byCode.get(sha256(raw)));
		return entry && !isExpired(entry) ? entry : undefined;
	}

	function claim({ sub, code, ipPrefix }) {
		const found = lookup({ sub, code, op: 'pair_claim' });
		if (found.refusal) return found.refusal;
		const { entry, subj } = found;
		audit('pair_claim', { subj, pair: tag(entry), status: 'ok' });
		return reply(200, {
			fp: entry.fp, name: entry.name, os_user: entry.osUser, platform: entry.platform, version: entry.version,
			age_s: Math.floor((now() - entry.startedAt) / 1000), agent_ip_prefix: entry.agentIp, your_ip_prefix: ipPrefix ?? null, subj,
		});
	}

	function refuseConfirm(entry, subj, fp, status) {
		audit('pair_confirm', { subj, pair: tag(entry), fp, status });
		return reply(409, { error: status });
	}
	function confirm({ sub, code, fp, username = null }) {
		const found = lookup({ sub, code, op: 'pair_confirm' });
		if (found.refusal) return found.refusal;
		const { entry, subj } = found;
		if (String(fp).toUpperCase() !== entry.fp) return refuseConfirm(entry, subj, entry.fp, 'fp-mismatch');
		if (entry.sub !== null && entry.sub !== sub) return refuseConfirm(entry, subj, entry.fp, 'taken');
		if (holdings(sub, entry) >= MAX_AGENTS_PER_SUB) return refuseConfirm(entry, subj, entry.fp, 'cap');
		entry.sub = sub;
		entry.username = username;
		audit('pair_confirm', { subj, pair: tag(entry), fp: entry.fp, status: 'ok' });
		return reply(202, { status: 'confirmed' });
	}

	function poll({ pairId }) {
		const entry = liveByPairId(pairId);
		if (!entry) return reply(410, { error: 'gone' });
		if (now() - entry.lastPollAt < POLL_INTERVAL_MS) return reply(429, { error: 'slow_down' });
		entry.lastPollAt = now();
		if (entry.sub === null) return reply(200, { status: 'pending' });
		return reply(200, { status: 'claimed', account: { un: entry.username, subj: subjectTag(entry.sub) } });
	}

	function refuseAccept(entry, status, httpStatus) {
		audit('pair_accept', { subj: entry?.sub ? subjectTag(entry.sub) : null, pair: entry ? tag(entry) : null, fp: entry?.fp, status });
		return reply(httpStatus, { error: status });
	}
	function writeRecord(entry) {
		const record = {
			agent_id: newAgentId(), sub: entry.sub, pubkey: b64url(entry.raw), fp: entry.fp, name: entry.name,
			os_user: entry.osUser, platform: entry.platform, created_at: new Date(now()).toISOString(), rotated_at: null, last_seen_at: null,
		};
		try { store.add(record); } catch { return null; }
		return record;
	}
	function accept({ pairId, sig }) {
		const entry = typeof pairId === 'string' ? pending.get(sha256(pairId)) : undefined;
		if (!entry) return refuseAccept(null, 'unknown', 410);
		if (isExpired(entry)) return refuseAccept(entry, 'expired', 410);
		if (entry.sub === null) return refuseAccept(entry, 'unconfirmed', 409);
		const signed = acceptMessage({ origin, pairId, subj: subjectTag(entry.sub) });
		if (!verifyMessage(entry.raw, signed, sig)) return refuseAccept(entry, 'bad-sig', 401);
		if (store.countFor(entry.sub) >= MAX_AGENTS_PER_SUB) { drop(entry); return refuseAccept(entry, 'cap', 409); }
		const record = writeRecord(entry);
		if (!record) return refuseAccept(entry, 'error', 500);
		drop(entry);
		audit('pair_accept', { subj: subjectTag(record.sub), pair: tag(entry), agent: record.agent_id, fp: record.fp, status: 'ok' });
		return reply(201, { agent_id: record.agent_id });
	}

	function decline({ pairId }) {
		const entry = liveByPairId(pairId);
		if (!entry) return reply(410, { error: 'gone' });
		drop(entry);
		audit('pair_accept', { subj: entry.sub ? subjectTag(entry.sub) : null, pair: tag(entry), fp: entry.fp, status: 'declined' });
		return reply(204, null);
	}

	return {
		start, claim, confirm, poll, accept, decline,
		get pendingCount() { sweep(); return pending.size; },
		debugSnapshot: () => Object.fromEntries([...pending].map(([key, entry]) => [key, { ...entry, raw: undefined }])),
	};
}
