/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-session-revocations.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The revoked session ids, polled like the per-user cut-offs and for the same reason: the
 * token verifier is synchronous and has ~50 callers, so nothing is read on the request path.
 *
 * A revoked session is one row of public.osionos_sessions with revoked_at set; the set holds
 * the ids of the revoked sessions that have not expired yet, keyed by the session id (the
 * app token's jti). The key is the id, never the user: one user's revoke must not end
 * another session of the same user.
 *
 * Caveat: a revoke reaches the other replicas only at the next poll (10 s), and a replica
 * whose last load is older than 60 s answers 503 for every token rather than vouching for a
 * session it cannot see the revocations of. The reload scans the revoked rows of the whole
 * table (the index on (expires_at) WHERE revoked_at IS NOT NULL arrives with P1-1); at the
 * 30-day session TTL of .env.local that scan spans a month of sign-ins.
 */

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

export { POLL_INTERVAL_MS, RETRY_AFTER_SECONDS, STALE_AFTER_MS };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLE_HINT = 'public.osionos_sessions must exist and be readable by the service role (apply models/osionos-account-foundation-migration.sql)';

function httpError(message, status, code) {
	return Object.assign(new Error(message), { status, code });
}

export class SessionRevocations extends PolledSessionSet {
	constructor({ enforced, offReason = '', now = Date.now, log = console } = {}) {
		super({
			enforced,
			offReason,
			now,
			log,
			label: 'session revocations',
			table: 'public.osionos_sessions',
			hint: TABLE_HINT,
			offEffect: 'a revoked session keeps working until it expires.',
			caveat: 'see the Caveat in bridge-session-revocations.mjs',
			largeTableRows: LARGE_TABLE_ROWS,
			// A revoked id stays revoked: the later expiry never un-revokes it.
			merge: (target, id, expiresAtMicros) => target.set(id, expiresAtMicros),
		});
	}

	/** True when this session id was revoked and the set is loaded. */
	isRevoked(id) {
		return this.entries?.has(id) === true;
	}

	/** The revoked ids with the moment their token expires, under the name the routes read. */
	get revoked() {
		return this.entries;
	}
}

/** Revocation is enforced on the same switch as the session rows: one off state for both. */
export function sessionRevocationsFromConfig(config, options = {}) {
	if (config.sessionRecordsMode === 'off') return new SessionRevocations({ ...options, enforced: false, offReason: 'OSIONOS_SESSION_RECORDS=off' });
	if (!config.serviceKey || !config.baasUrl) return new SessionRevocations({ ...options, enforced: false, offReason: 'no service key or BaaS URL' });
	return new SessionRevocations({ ...options, enforced: true });
}

/** Synchronous: 503 unless the set is loaded and recent, 401 for a revoked session id. */
export function assertSessionNotRevoked(tracker, sessionId) {
	if (!tracker) return;
	const state = tracker.status();
	if (state === 'off') return;
	if (state !== 'fresh') {
		throw Object.assign(httpError('The per-session revocation check is not ready; try again shortly.', 503, 'session_revocations_unavailable'), { retryAfterSeconds: RETRY_AFTER_SECONDS });
	}
	if (tracker.isRevoked(sessionId)) {
		throw httpError('App session was revoked.', 401, 'session_revoked');
	}
}

/** Every revoked session that has not expired yet, keyed by the session id. */
export async function loadRevokedSessions(source, { now = Date.now, timeoutMs } = {}) {
	const rows = await readPagedRows(source, {
		table: 'osionos_sessions',
		select: 'id,expires_at',
		orderColumn: 'id',
		filters: { revoked_at: 'not.is.null', expires_at: `gt.${new Date(now()).toISOString()}` },
		pageSize: PAGE_SIZE,
		timeoutMs,
	});
	const loaded = new Map();
	for (const row of rows) {
		const id = typeof row?.id === 'string' ? row.id.toLowerCase() : '';
		const micros = timestampMicros(row?.expires_at);
		if (!UUID.test(id) || micros === null) throw new Error('a row had no valid id and expires_at');
		loaded.set(id, micros);
	}
	return loaded;
}

/** The poller behind the revoked set: the same loop the cut-offs use. */
export function startSessionRevocationPoller(tracker, source, { intervalMs = POLL_INTERVAL_MS, timeoutMs } = {}) {
	return startPolledSessionPoller(tracker, () => loadRevokedSessions(source, { now: tracker.now, timeoutMs }), { intervalMs });
}
