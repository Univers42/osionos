/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-session-cutoff.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Session cut-off: a password reset sets public.auth_session_cutoffs.sessions_valid_after,
// and an osionos_v1 token issued before it is refused. The verifier is synchronous and has
// ~50 callers, so the per-user row is fetched before dispatch (refreshSessionCutoff) and read
// synchronously inside the verifier (assertSessionNotCutOff).
//
// Caveat: the row is cached per process for `ttlMs` (5 s), dated from the start of the
// lookup, so a cut-off written at T is enforced on requests whose lookup starts after
// T + ttlMs; each bridge replica caches on its own. Cut-off and iat_ms come from two clocks
// (Postgres now() and the bridge's Date.now()); skew between them moves the boundary by
// the skew. A restart forgets every known row, so a lookup outage right after one fails
// open for every user (with an audit line each).
//
// On a failed lookup: a user with a cut-off on record is refused (503, retryable) unless the
// token is already older than that cut-off (401). A user with none is served, and an audit
// line is written. Reason: the row only exists after a reset, the event that signals a
// possible compromise, so those users take the strict rule; failing closed for everyone
// would turn a PostgREST blip into an outage of every bridge route for a revocation that, for
// a user who never reset, does not exist.

const DEFAULT_TTL_MS = 5_000;
const DEFAULT_MAX_ENTRIES = 10_000;
const TIMESTAMPTZ = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;

function httpError(message, status) {
	return Object.assign(new Error(message), { status });
}

export function createSessionCutoffCache({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES, audit = (line) => console.warn(line) } = {}) {
	return { ttlMs, maxEntries, audit, entries: new Map(), inflight: new Map() };
}

function isoOffset(offset) {
	if (offset === 'Z') return 'Z';
	const digits = offset.slice(1).replace(':', '');
	return `${offset[0]}${digits.slice(0, 2)}:${digits.slice(2) || '00'}`;
}

/** A timestamptz as PostgREST renders it → integer microseconds since the epoch, or null. */
export function timestampMicros(text) {
	const match = typeof text === 'string' ? TIMESTAMPTZ.exec(text) : null;
	if (!match) return null;
	const [, date, time, fraction = '', offset] = match;
	const wholeMs = Date.parse(`${date}T${time}${isoOffset(offset)}`);
	if (!Number.isFinite(wholeMs)) return null;
	return wholeMs * 1000 + Number(fraction.padEnd(6, '0').slice(0, 6));
}

/** iat_ms when the token has one; a token minted before it counts as issued at the start of its iat second. */
export function tokenIssuedAtMs(payload) {
	if (payload.iat_ms !== undefined) {
		if (!Number.isSafeInteger(payload.iat_ms) || payload.iat_ms < 0) throw httpError('App session token issue time is invalid.', 401);
		return payload.iat_ms;
	}
	const iat = Number(payload.iat);
	return Number.isFinite(iat) ? iat * 1000 : 0;
}

function pruneUnrevoked(cache, now) {
	if (cache.entries.size <= cache.maxEntries) return;
	for (const [userId, entry] of cache.entries) {
		if (entry.validAfterMicros === null && entry.expiresAt <= now) cache.entries.delete(userId);
	}
}

async function settle(cache, userId, lookup, startedAt) {
	const expiresAt = startedAt + cache.ttlMs;
	try {
		const text = await lookup(userId);
		const validAfterMicros = text == null ? null : timestampMicros(text);
		if (text != null && validAfterMicros === null) throw new Error('sessions_valid_after is not a timestamp');
		cache.entries.set(userId, { validAfterMicros, failed: false, expiresAt });
	} catch (error) {
		const known = cache.entries.get(userId)?.validAfterMicros ?? null;
		cache.entries.set(userId, { validAfterMicros: known, failed: true, expiresAt });
		const outcome = known === null ? 'no cut-off on record, serving its tokens' : 'cut-off on record, refusing its tokens';
		cache.audit(`[osionos-bridge] audit: session cut-off lookup failed for user ${userId} (${error?.message ?? 'unknown error'}); ${outcome} for ${cache.ttlMs} ms`);
	}
	pruneUnrevoked(cache, startedAt);
}

/** Make the cached cut-off for `userId` at most `ttlMs` old; concurrent callers share one lookup. Never rejects. */
export function refreshSessionCutoff(cache, userId, lookup, now = Date.now()) {
	const current = cache.entries.get(userId);
	if (current && current.expiresAt > now) return Promise.resolve();
	const pending = cache.inflight.get(userId);
	if (pending) return pending;
	const run = settle(cache, userId, lookup, now).finally(() => cache.inflight.delete(userId));
	cache.inflight.set(userId, run);
	return run;
}

/** Synchronous: throws 401 for a token issued before the cached cut-off, 503 when the lookup failed for a user who has one. */
export function assertSessionNotCutOff(cache, userId, issuedAtMs) {
	const entry = cache?.entries.get(userId);
	if (!entry) return;
	if (entry.validAfterMicros !== null && issuedAtMs * 1000 < entry.validAfterMicros) {
		throw httpError('App session token was revoked; sign in again.', 401);
	}
	if (entry.failed && entry.validAfterMicros !== null) {
		throw httpError('The session revocation check is unavailable; try again shortly.', 503);
	}
}
