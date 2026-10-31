/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-machines-pairing.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The pending pairings of own machines (own-machines-plan.md, devil verdict 2026-10-31,
// condition 4): pure state with an injected clock, so the HTTP glue in bridge-machines.mjs stays
// thin. The code is the relay's (ide-relay-pairing.mjs), but it is consumed by the first claim:
// a code read off a victim's screen is useless once the victim typed it.
//
// Caveat: pending entries and every limiter live in this process. A restart forgets them (the
// node starts again), and two bridge replicas would each grant their own budget, so the global
// caps hold per replica, not per stack.
// Caveat: without a configured client-IP header the start limiter keys on the socket peer, which
// behind Funnel or a proxy is one address for everyone: one caller can then stall pairing for all
// users (condition 9). That is the safe direction; nobody pairs more, everybody pairs later.
// Caveat: the global failed-claim cap (500 per 10 min) is a lockout lever: a few hundred accounts
// failing on purpose stop every user from claiming for 10 minutes. It is sized so that needs many
// accounts, not one; brute force across the 20^8 code space stays out of reach either way.
// Caveat: an approved entry still expires 300 s after its start. A node that stops polling in
// that window leaves a row it never learns about; the owner removes it from the list.
import { randomBytes, randomInt } from 'node:crypto';

import { accountError } from './bridge-account-sudo.mjs';
import { b64url, fingerprint, fromB64url, verifyMessage } from './ide-agent-frames.mjs';
import { createSlidingLimiter } from './ide-relay-limits.mjs';
import { pairPollMessage, pairStartMessage } from './machine-protocol.mjs';

const CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ]{8}$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;
// The machines table CHECK, here so a start the row would refuse is a 400 and not a 500 at approve.
const PLATFORM_RE = /^(linux|darwin|win32)-(x64|arm64)$/;
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}(-[A-Za-z0-9.]{1,16})?$/;
const LIFE_MS = 300_000;
const POLL_INTERVAL_S = 5;
const SKEW_MS = 60_000;
const WINDOW_MS = 600_000;
const MAX_PENDING = 50;

const randomCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const formatCode = (raw) => `${raw.slice(0, 4)}-${raw.slice(4)}`;
const normalizeCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z]/g, '');
const notFound = () => accountError(404, 'not_found', 'No such pairing.');
const limited = () => accountError(429, 'rate_limited', 'Too many attempts; try again later.', { retryAfterSeconds: WINDOW_MS / 1000 });
const badSignature = () => accountError(401, 'bad_signature', 'The signature does not verify.');

function validStart(body) {
	const { pubkey, name, platform, version, ts, sig } = body ?? {};
	const raw = typeof pubkey === 'string' ? fromB64url(pubkey) : null;
	const ok = raw?.length === 32 && b64url(raw) === pubkey && typeof name === 'string' && NAME_RE.test(name)
		&& typeof platform === 'string' && PLATFORM_RE.test(platform) && typeof version === 'string' && VERSION_RE.test(version)
		&& Number.isSafeInteger(ts) && typeof sig === 'string';
	if (!ok) throw accountError(400, 'bad_request', 'The pairing request is malformed.');
	return { raw, pubkey, name, platform, version, ts, sig };
}

export function createMachinePairing({ now = Date.now } = {}) {
	const pending = new Map(); // pairId -> entry
	const byCode = new Map(); // code -> pairId, until the first claim
	const startsPerClient = createSlidingLimiter({ limit: 5, windowMs: WINDOW_MS, now });
	const startsGlobal = createSlidingLimiter({ limit: 20, windowMs: WINDOW_MS, now });
	const failuresPerUser = createSlidingLimiter({ limit: 5, windowMs: WINDOW_MS, now });
	const failuresGlobal = createSlidingLimiter({ limit: 500, windowMs: WINDOW_MS, now });
	const isLive = (entry) => entry !== undefined && now() - entry.startedAt <= LIFE_MS;

	function drop(entry) {
		pending.delete(entry.pairId);
		byCode.delete(entry.code);
	}
	function sweep() {
		for (const entry of [...pending.values()]) if (!isLive(entry)) drop(entry);
	}
	function issue(fields, startIp) {
		let code = randomCode();
		while (byCode.has(code)) code = randomCode();
		const pairId = b64url(randomBytes(32));
		const entry = { ...fields, pairId, code, startIp, startedAt: now(), fingerprint: fingerprint(fields.raw), claimer: null, reserved: false, approved: null, declined: false };
		pending.set(pairId, entry);
		byCode.set(code, pairId);
		return { pairId, code: formatCode(code), expiresIn: LIFE_MS / 1000, interval: POLL_INTERVAL_S };
	}

	// The limit is taken before the signature check: verifying is the expensive part.
	function start(body, { origin, clientKey, startIp }) {
		sweep();
		const fields = validStart(body);
		if ((clientKey && !startsPerClient.take(clientKey)) || !startsGlobal.take('global')) throw limited();
		if (Math.abs(now() - fields.ts) > SKEW_MS) throw accountError(400, 'bad_request', 'ts is more than 60 s from the bridge clock.');
		if (!verifyMessage(fields.raw, pairStartMessage({ origin, pubkey: fields.pubkey, name: fields.name, ts: fields.ts }), fields.sig)) throw badSignature();
		if (pending.size >= MAX_PENDING) throw limited();
		return issue(fields, startIp);
	}

	// Refuses before it looks, so a user (or a crowd) past its failures learns nothing from a good guess.
	function claim(userId, code) {
		if (!failuresPerUser.peek(userId) || !failuresGlobal.peek('global')) throw limited();
		const raw = normalizeCode(code);
		const entry = CODE_RE.test(raw) ? pending.get(byCode.get(raw)) : undefined;
		if (!isLive(entry)) {
			failuresPerUser.record(userId);
			failuresGlobal.record('global');
			throw notFound();
		}
		byCode.delete(entry.code);
		entry.claimer = userId;
		return entry;
	}

	function claimedBy(userId, pairId) {
		const entry = typeof pairId === 'string' ? pending.get(pairId) : undefined;
		if (!isLive(entry) || entry.claimer !== userId || entry.approved || entry.declined) throw notFound();
		return entry;
	}

	// Synchronous, so two concurrent approves of one entry cannot both write a row.
	function reserve(userId, pairId) {
		const entry = claimedBy(userId, pairId);
		if (entry.reserved) throw notFound();
		entry.reserved = true;
		return entry;
	}
	const release = (entry) => { entry.reserved = false; };
	const markApproved = (entry, approved) => { entry.approved = approved; };
	// An entry whose row is being written is no longer the claimer's to decline: the row would land
	// while the node reads 410 and forgets its key.
	function decline(userId, pairId) {
		const entry = claimedBy(userId, pairId);
		if (entry.reserved) throw notFound();
		entry.declined = true;
	}

	function poll({ pairId, ts, sig } = {}, { origin }) {
		const entry = typeof pairId === 'string' ? pending.get(pairId) : undefined;
		if (!isLive(entry)) throw notFound();
		const fresh = Number.isSafeInteger(ts) && Math.abs(now() - ts) <= SKEW_MS;
		if (!fresh || !verifyMessage(entry.raw, pairPollMessage({ origin, pairId, ts }), sig)) throw badSignature();
		if (entry.declined) {
			drop(entry);
			throw accountError(410, 'declined', 'The pairing was declined in the app.');
		}
		if (!entry.approved) return null;
		drop(entry);
		return entry.approved;
	}

	return { start, claim, reserve, release, markApproved, decline, poll, get size() { return pending.size; } };
}
