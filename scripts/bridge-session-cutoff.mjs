/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-session-cutoff.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Server-side revocation of osionos_v1 app sessions. public.auth_session_cutoffs holds one
// sessions_valid_after per user (a password reset writes it, so does POST /api/auth/bridge/logout);
// a token issued before it is refused. The verifier is synchronous and has ~50 callers, so the
// whole table lives in a bridge-wide Map that a poller replaces every 10 s. Nothing here touches
// the network on the request path.
//
// Fail-closed: until the first full load, and when the last load is older than 60 s, EVERY
// verification answers 503 (a token minted after the last poll can belong to a user whose
// sign-out we have not seen, so no token can be vouched for).
//
// Caveat: a full reload costs about 112 B/row every 10 s (1k rows = 112 KB, measured 2026-10-19
// on PostgREST v12.2.3), so the cost grows with the table and not with traffic; a warning fires
// past 5,000 rows. The reopen point is a delta poll on a DB-assigned updated_at with a lookback
// window plus a periodic full reload (a cursor on sessions_valid_after itself misses rows:
// now() is the transaction START, so a slow writer commits behind the cursor). A revocation is
// enforced up to 10 s plus one query late on a bridge replica that did not take the write, and
// up to 60 s during a poll outage. The row-count check (Content-Range) can fail a healthy tick
// when a row is inserted between pages; that only delays a load by one tick.

import { BAAS_FETCH_TIMEOUT_MS } from './bridge-baas-body.mjs';

export const POLL_INTERVAL_MS = 10_000;
export const STALE_AFTER_MS = 60_000;
export const RETRY_AFTER_SECONDS = 5;
const PAGE_SIZE = 500;
const LARGE_TABLE_ROWS = 5_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMPTZ = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;
const TABLE_HINT = 'public.auth_session_cutoffs must exist and be readable by the service role (apply models/auth-session-cutoffs.sql)';

function httpError(message, status, code) {
	return Object.assign(new Error(message), { status, code });
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

export class SessionCutoffs {
	/** `offReason` is set exactly when `enforced` is false. */
	constructor({ enforced, offReason = '', now = Date.now, log = console } = {}) {
		this.enforced = enforced;
		this.offReason = offReason;
		this.now = now;
		this.log = log;
		this.cutoffs = null;
		this.loadedAt = null;
		this.observedState = enforced ? 'loading' : 'off';
		this.failureStreak = null;
		this.warnedLarge = false;
		this.writeSequence = 0;
		this.localWrites = new Map();
	}

	/** One of off | loading | fresh | stale; a change is logged once, whoever observes it first. */
	status() {
		const state = this.#state();
		if (state !== this.observedState) {
			this.#announce(state);
			this.observedState = state;
		}
		return state;
	}

	ageMs() {
		return this.loadedAt === null ? null : this.now() - this.loadedAt;
	}

	/** Cut-off in microseconds for a lower-case user id, or undefined. */
	cutoffMicros(userId) {
		return this.cutoffs?.get(userId);
	}

	/** A write this process just made applies at once and survives a swap from a poll that began earlier. */
	applyLocal(userId, micros) {
		this.writeSequence += 1;
		this.localWrites.set(userId, { micros, sequence: this.writeSequence });
		if (this.cutoffs) this.cutoffs.set(userId, Math.max(this.cutoffs.get(userId) ?? micros, micros));
	}

	/** Mark the start of a poll; hand the result to completeLoad. */
	beginLoad() {
		return this.writeSequence;
	}

	completeLoad(loaded, startSequence) {
		for (const [userId, write] of this.localWrites) {
			if (write.sequence > startSequence) loaded.set(userId, Math.max(loaded.get(userId) ?? write.micros, write.micros));
		}
		this.localWrites.clear();
		this.cutoffs = loaded;
		this.loadedAt = this.now();
		this.failureStreak = null;
		if (loaded.size > LARGE_TABLE_ROWS && !this.warnedLarge) {
			this.warnedLarge = true;
			this.log.warn(`[osionos-bridge] session cutoffs: ${loaded.size} rows; a full reload every ${POLL_INTERVAL_MS / 1000} s now moves more than 500 KB (see the Caveat in bridge-session-cutoff.mjs).`);
		}
		this.status();
	}

	failLoad(error) {
		const message = error instanceof Error ? error.message : String(error);
		if (this.failureStreak !== message) this.log.warn(`[osionos-bridge] session cutoffs: load failed (${message}); ${TABLE_HINT}.`);
		this.failureStreak = message;
		this.status();
	}

	bootLine() {
		return this.enforced
			? `[osionos-bridge] session cutoffs: enforcing; every token request answers 503 until the first load of public.auth_session_cutoffs.`
			: `[osionos-bridge] session cutoffs: OFF (${this.offReason}); signed-out app sessions stay valid until they expire.`;
	}

	#state() {
		if (!this.enforced) return 'off';
		if (this.loadedAt === null) return 'loading';
		return this.now() - this.loadedAt > STALE_AFTER_MS ? 'stale' : 'fresh';
	}

	#announce(state) {
		if (state === 'fresh') this.log.info('[osionos-bridge] session cutoffs: fresh, serving tokens.');
		else this.log.warn(`[osionos-bridge] session cutoffs: ${state}; every token request answers 503 until a load succeeds. ${TABLE_HINT}.`);
	}
}

/** Enforcement is on when the bridge can reach the table, unless the operator turned it off. */
export function sessionCutoffsFromConfig(config, options = {}) {
	if (config.sessionCutoffsMode === 'off') return new SessionCutoffs({ ...options, enforced: false, offReason: 'OSIONOS_SESSION_CUTOFFS=off' });
	if (!config.serviceKey || !config.baasUrl) return new SessionCutoffs({ ...options, enforced: false, offReason: 'no service key or BaaS URL' });
	return new SessionCutoffs({ ...options, enforced: true });
}

/** Synchronous: 503 unless the table is loaded and recent, 401 for a token issued before its user's cut-off. */
export function assertSessionNotCutOff(tracker, userId, issuedAtMs) {
	if (!tracker) return;
	const state = tracker.status();
	if (state === 'off') return;
	if (state !== 'fresh') {
		throw Object.assign(httpError('The session revocation check is not ready; try again shortly.', 503, 'session_cutoffs_unavailable'), { retryAfterSeconds: RETRY_AFTER_SECONDS });
	}
	const cutoff = tracker.cutoffMicros(userId);
	if (cutoff !== undefined && issuedAtMs * 1000 < cutoff) {
		throw httpError('App session was signed out.', 401, 'session_revoked');
	}
}

function contentRangeTotal(header) {
	const total = /\/(\d+)$/.exec(header ?? '')?.[1];
	if (total === undefined) throw new Error(`Content-Range carried no total (${header ?? 'header missing'})`);
	return Number(total);
}

function withDeadline(run, timeoutMs) {
	const controller = new AbortController();
	let timer;
	const deadline = new Promise((_, reject) => {
		timer = setTimeout(() => { controller.abort(); reject(new Error(`timed out after ${timeoutMs} ms`)); }, timeoutMs);
	});
	return Promise.race([run(controller.signal), deadline]).finally(() => clearTimeout(timer));
}

async function readPage({ fetchImpl, baasUrl, serviceKey }, cursor, signal) {
	const params = new URLSearchParams({ select: 'user_id,sessions_valid_after', order: 'user_id.asc', limit: String(PAGE_SIZE) });
	if (cursor !== null) params.set('user_id', `gt.${cursor}`);
	const headers = { Accept: 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
	if (cursor === null) headers.Prefer = 'count=exact';
	const response = await fetchImpl(`${baasUrl}/rest/v1/auth_session_cutoffs?${params}`, { headers, signal });
	if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text().catch(() => '')).slice(0, 160)}`);
	const rows = JSON.parse(await response.text());
	if (!Array.isArray(rows)) throw new Error('the answer was not a row list');
	return { rows, contentRange: response.headers.get('content-range') };
}

function addRows(loaded, rows) {
	for (const row of rows) {
		const micros = timestampMicros(row?.sessions_valid_after);
		if (typeof row?.user_id !== 'string' || !UUID.test(row.user_id) || micros === null) throw new Error('a row had no valid user_id and sessions_valid_after');
		loaded.set(row.user_id.toLowerCase(), micros);
	}
}

/** The whole table by keyset pages on user_id; throws unless every row the first page counted arrived. */
export async function loadAllCutoffs(source, timeoutMs) {
	const loaded = new Map();
	let received = 0;
	let total = null;
	let cursor = null;
	for (;;) {
		const page = await withDeadline((signal) => readPage(source, cursor, signal), timeoutMs);
		if (cursor === null) total = contentRangeTotal(page.contentRange);
		addRows(loaded, page.rows);
		received += page.rows.length;
		if (page.rows.length < PAGE_SIZE) break;
		const last = page.rows.at(-1).user_id.toLowerCase();
		if (cursor !== null && last <= cursor) throw new Error('the keyset cursor did not advance');
		cursor = last;
	}
	if (received !== total) throw new Error(`received ${received} rows but Content-Range counted ${total} (truncated by max-rows, or rows changed between pages)`);
	return loaded;
}

/**
 * Polls with a setTimeout chain (a tick never overlaps the next) and unref'd timers. A tick
 * never rejects: every failure becomes failLoad. `stop()` ends the chain.
 */
export function startSessionCutoffPoller(tracker, source, { intervalMs = POLL_INTERVAL_MS, timeoutMs = BAAS_FETCH_TIMEOUT_MS } = {}) {
	let timer = null;
	let stopped = false;
	async function tick() {
		const startSequence = tracker.beginLoad();
		try {
			tracker.completeLoad(await loadAllCutoffs(source, timeoutMs), startSequence);
		} catch (error) {
			tracker.failLoad(error);
		}
	}
	async function run() {
		await tick();
		if (stopped) return;
		timer = setTimeout(run, intervalMs);
		timer.unref();
	}
	if (tracker.enforced) run();
	return { tick, stop() { stopped = true; clearTimeout(timer); } };
}
