/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-session-cutoff.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
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
//
// The state, the freshness threshold, the announce, the paged reload, the local writes and the
// poller loop live in bridge-session-tracker.mjs: the revoked session ids are polled the same
// way, and two copies of this machinery would drift apart on what "fresh" means.

import { BAAS_FETCH_TIMEOUT_MS } from './bridge-baas-body.mjs';
import {
	LARGE_TABLE_ROWS,
	PAGE_SIZE,
	POLL_INTERVAL_MS,
	RETRY_AFTER_SECONDS,
	STALE_AFTER_MS,
	PolledSessionSet,
	readPagedRows,
	startPolledSessionPoller,
	timestampMicros,
} from './bridge-session-tracker.mjs';

export { POLL_INTERVAL_MS, RETRY_AFTER_SECONDS, STALE_AFTER_MS, timestampMicros };

/**
 * The cut-off tracker of one process: the whole table lives in a Map that the
 * poller replaces every 10 s, so a verification never touches the network.
 *
 * The bridge and the osionos-ai service both hold one, and the token verifier
 * reads it (assertSessionNotCutOff), so the shape below is the one both code
 * paths see. It is written in JSDoc, in the module that owns the behaviour:
 * a copy of it somewhere else is a copy that drifts.
 *
 * @typedef {object} SessionCutoffTracker
 * @property {boolean} enforced whether the cut-offs are enforced at all
 * @property {() => string} status off | loading | fresh | stale
 * @property {(userId: string) => number | undefined} cutoffMicros the cut-off of one user, in microseconds
 * @property {() => number} beginLoad the sequence number of the writes this process made
 * @property {(loaded: Map<string, number>, startSequence: number) => void} completeLoad
 * @property {(error: unknown) => void} failLoad
 */

/**
 * The log the tracker writes its warnings to: the bridge's and the service's
 * console.
 *
 * @typedef {object} SessionCutoffLog
 * @property {(message: string) => void} info
 * @property {(message: string) => void} warn
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLE_HINT = 'public.auth_session_cutoffs must exist and be readable by the service role (apply models/auth-session-cutoffs.sql)';

function httpError(message, status, code) {
	return Object.assign(new Error(message), { status, code });
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

export class SessionCutoffs extends PolledSessionSet {
	constructor({ enforced, offReason = '', now = Date.now, log = console } = {}) {
		super({
			enforced,
			offReason,
			now,
			log,
			label: 'session cutoffs',
			table: 'public.auth_session_cutoffs',
			hint: TABLE_HINT,
			offEffect: 'signed-out app sessions stay valid until they expire.',
			caveat: 'see the Caveat in bridge-session-cutoff.mjs',
			largeTableRows: LARGE_TABLE_ROWS,
			// The later of two instants wins: a cut-off never moves backwards for a user.
			merge: (target, userId, micros) => target.set(userId, Math.max(target.get(userId) ?? micros, micros)),
		});
	}

	/** Cut-off in microseconds for a lower-case user id, or undefined. */
	cutoffMicros(userId) {
		return this.entries?.get(userId);
	}

	/** The loaded table, under the name the cut-off suites read it by. */
	get cutoffs() {
		return this.entries;
	}
}

/**
 * Enforcement is on when the bridge can reach the table, unless the operator turned it off.
 *
 * @param {{ sessionCutoffsMode?: string, serviceKey?: string, baasUrl?: string }} config the bridge's config
 * @param {{ now?: () => number, log?: SessionCutoffLog }} [options] the clock and the log of the tracker
 * @returns {SessionCutoffTracker}
 */
export function sessionCutoffsFromConfig(config, options = {}) {
	if (config.sessionCutoffsMode === 'off') return new SessionCutoffs({ ...options, enforced: false, offReason: 'OSIONOS_SESSION_CUTOFFS=off' });
	if (!config.serviceKey || !config.baasUrl) return new SessionCutoffs({ ...options, enforced: false, offReason: 'no service key or BaaS URL' });
	return new SessionCutoffs({ ...options, enforced: true });
}

/**
 * Synchronous: 503 unless the table is loaded and recent, 401 for a token issued before its user's cut-off.
 *
 * @param {SessionCutoffTracker | undefined | null} tracker the tracker of the process, nothing when there is none
 * @param {string} userId the lower-case id of the user the token belongs to
 * @param {number} issuedAtMs the moment the token was minted, in milliseconds
 * @returns {void}
 */
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

function addRows(loaded, rows) {
	for (const row of rows) {
		const micros = timestampMicros(row?.sessions_valid_after);
		if (typeof row?.user_id !== 'string' || !UUID.test(row.user_id) || micros === null) throw new Error('a row had no valid user_id and sessions_valid_after');
		loaded.set(row.user_id.toLowerCase(), micros);
	}
}

/** The whole table by keyset pages on user_id; throws unless every row the first page counted arrived. */
export async function loadAllCutoffs(source, timeoutMs) {
	const rows = await readPagedRows(source, {
		table: 'auth_session_cutoffs',
		select: 'user_id,sessions_valid_after',
		orderColumn: 'user_id',
		pageSize: PAGE_SIZE,
		timeoutMs,
	});
	const loaded = new Map();
	addRows(loaded, rows);
	return loaded;
}

/**
 * Polls with a setTimeout chain (a tick never overlaps the next) and unref'd timers. A tick
 * never rejects: every failure becomes failLoad. `stop()` ends the chain.
 *
 * @param {SessionCutoffTracker} tracker the tracker the loaded table goes into
 * @param {{ fetchImpl?: typeof fetch, baasUrl: string, serviceKey: string }} source where the table is read from
 * @param {{ intervalMs?: number, timeoutMs?: number }} [options] the interval between two ticks, the deadline of one read
 * @returns {{ tick: () => Promise<void>, stop: () => void }}
 */
export function startSessionCutoffPoller(tracker, source, { intervalMs = POLL_INTERVAL_MS, timeoutMs = BAAS_FETCH_TIMEOUT_MS } = {}) {
	return startPolledSessionPoller(tracker, () => loadAllCutoffs(source, timeoutMs), { intervalMs });
}
