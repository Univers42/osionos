/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-sessions.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The account plane's session rows: one row per delivered app session, written by the
 * bridge when the session reaches the client, and the two routes that list and revoke them.
 *
 * The row is built ONLY from the token being delivered (its jti, sub, iat_ms and exp), never
 * from the handoff record: the handoff carries its own 90 s expiry, and a row built from
 * that would leave the polled revocation set after 90 s — the revoked token would work again.
 *
 * The owner reads their rows through `asUser` (ADR 0001: the role has SELECT on nine columns
 * and never writes); the bridge writes them through `asService` (ADR 0003). Both writes take
 * the user id from the verified session, never from the request.
 *
 * Caveat: the list has no paging — a user with more than 50 live sessions sees the newest 50
 * and the rest are not reachable from the API. `last_seen_at` is never written (a write per
 * request is the P0-5 problem), and no reaper removes the rows of expired sessions yet.
 */

import { clientMeta, rateLimit, writeAudit } from './bridge-guard.mjs';
import { bearerToken, requireUuid, sendJson } from './bridge-social-core.mjs';
import { kvBootLine, kvState } from './bridge-shared-store.mjs';
import { sessionRevocationsFromConfig } from './bridge-session-revocations.mjs';
import { timestampMicros } from './bridge-session-tracker.mjs';

const TOKEN_VERSION = 'osionos_v1';
const SESSION_COLUMNS = 'id,created_at,expires_at,last_seen_at,auth_method,ip_prefix,user_agent';
const LIST_LIMIT = 50;
const REVOKE_LIMIT = 30;
const REVOKE_WINDOW_MS = 60_000;
const AUTH_METHODS = new Set(['password', 'email_otp', 'passkey', 'oauth', 'handoff', 'refresh']);

function sessionError(status, code, message) {
	return Object.assign(new Error(message), { status, code });
}

/**
 * The one off state of the whole feature: recording, enforcement and the routes. Off by the
 * env switch or by a missing service key / BaaS URL — the same reasons as the cut-offs.
 */
export function sessionRecordsFromConfig(config) {
	if (config.sessionRecordsMode === 'off') return { enabled: false, offReason: 'OSIONOS_SESSION_RECORDS=off' };
	if (!config.serviceKey || !config.baasUrl) return { enabled: false, offReason: 'no service key or BaaS URL' };
	return { enabled: true, offReason: '' };
}

/** The records state and the revocation tracker, both hung off the config. */
export function sessionStateFromConfig(config, options = {}) {
	return {
		sessionRecords: config.sessionRecords ?? sessionRecordsFromConfig(config),
		sessionRevocations: config.sessionRevocations ?? sessionRevocationsFromConfig(config, options),
	};
}

export function sessionRecordsBootLine(records) {
	return records.enabled
		? '[osionos-bridge] session records: enforcing; every token request answers 503 until the first load of public.osionos_sessions.'
		: `[osionos-bridge] session records: OFF (${records.offReason}); sessions are neither listed nor revocable one by one.`;
}

/** The one boot line of the bridge: what is enforced, what is only kept in this process. */
export function bridgeBootLine(server) {
	return [
		server.sessionCutoffs.bootLine(),
		sessionRecordsBootLine(server.sessionRecords),
		kvBootLine(server.kvRequired),
	].join(' | ');
}

/** True when something is off: the boot line is then a warning, not a notice. */
export function bridgeBootIsDegraded(server) {
	return !server.sessionCutoffs.enforced || !server.sessionRecords.enabled || !server.kvRequired;
}

/** What the health route answers: the state of every table the token check reads. */
export function bridgeHealthState(config) {
	const cutoffs = config.sessionCutoffs;
	const revocations = config.sessionRevocations;
	return {
		ok: true,
		service: 'osionos-bridge',
		session_cutoffs: cutoffs?.status() ?? 'off',
		session_cutoffs_age_ms: cutoffs?.ageMs() ?? null,
		session_revocations: revocations?.status() ?? 'off',
		session_revocations_age_ms: revocations?.ageMs() ?? null,
		kv: kvState(config),
	};
}

/**
 * The bridge's clock for the session rows: the one the token verifier reads, so a row and
 * the token it describes are stamped by the same clock.
 */
export function sessionClock(config) {
	return config.sessionCutoffs?.now?.() ?? Date.now();
}

/** The client metadata of the request, with the IP columns blank when no header is configured. */
function sessionClientMeta(request, config) {
	const meta = clientMeta(request, { ipHeader: config.clientIpHeader, hashSecret: config.ipHashSecret });
	// Without a configured header the socket peer is the proxy, so every row would record
	// the proxy's /24: the IP columns stay NULL instead.
	if (!config.clientIpHeader) {
		meta.ipPrefix = null;
		meta.ipHash = null;
	}
	return meta;
}

function decodeAccessToken(accessToken) {
	const parts = String(accessToken ?? '').split('.');
	if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
		throw sessionError(500, 'session_token_unreadable', 'The delivered session token could not be read.');
	}
	let claims;
	try {
		claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
	} catch {
		throw sessionError(500, 'session_token_unreadable', 'The delivered session token could not be read.');
	}
	const jti = typeof claims?.jti === 'string' ? claims.jti.toLowerCase() : '';
	const sub = typeof claims?.sub === 'string' ? claims.sub.toLowerCase() : '';
	const iatMs = Number(claims?.iat_ms);
	const exp = Number(claims?.exp);
	if (!jti || !sub || !Number.isFinite(iatMs) || !Number.isFinite(exp)) {
		throw sessionError(500, 'session_token_unreadable', 'The delivered session token could not be read.');
	}
	return { jti, sub, iatMs, exp };
}

/**
 * Writes the row of the session that is being delivered. The primary key is the token jti,
 * so a row that already exists is a session that was already delivered: a 409, never a
 * silent overwrite.
 */
export async function recordSession(pg, { accessToken, authMethod, meta } = {}) {
	if (!AUTH_METHODS.has(authMethod)) throw new TypeError('authMethod must be a known sign-in method.');
	const claims = decodeAccessToken(accessToken);
	const row = {
		id: claims.jti,
		user_id: claims.sub,
		created_at: new Date(claims.iatMs).toISOString(),
		expires_at: new Date(claims.exp * 1000).toISOString(),
		auth_method: authMethod,
		ip_prefix: meta?.ipPrefix ?? null,
		ip_hash: meta?.ipHash ?? null,
		user_agent: meta?.userAgent ?? null,
	};
	try {
		await pg.asService().post('osionos_sessions', row, { prefer: 'return=minimal' });
	} catch (error) {
		if (String(error?.upstreamCode) === '23505') {
			throw sessionError(409, 'session_record_conflict', 'This session was already recorded.');
		}
		throw sessionError(503, 'session_record_unavailable', 'The session could not be recorded; try again shortly.');
	}
	return row;
}

/** The row of the session that is being delivered; nothing is written while the records are off. */
export async function recordDeliveredSession(config, pg, { request, accessToken, authMethod } = {}) {
	if (!config.sessionRecords?.enabled) return null;
	return recordSession(pg, { accessToken, authMethod, meta: sessionClientMeta(request, config) });
}

function liveSince(cutoffMicros, createdAt) {
	if (cutoffMicros === undefined || cutoffMicros === null) return true;
	const created = timestampMicros(createdAt);
	// An unreadable created_at is kept: the row is the user's, the cutoff is the coarse rule.
	return created === null || created >= cutoffMicros;
}

async function listSessions({ config, pg, session }, response) {
	const now = sessionClock(config);
	const params = new URLSearchParams({
		select: SESSION_COLUMNS,
		revoked_at: 'is.null',
		expires_at: `gt.${new Date(now).toISOString()}`,
		order: 'created_at.desc',
		limit: String(LIST_LIMIT),
	});
	const rows = await pg.asUser(session).get(`osionos_sessions?${params}`);
	const cutoffMicros = config.sessionCutoffs?.cutoffMicros?.(session.userId);
	const currentId = String(session.raw?.jti ?? '').toLowerCase();
	const sessions = (Array.isArray(rows) ? rows : [])
		.filter((row) => liveSince(cutoffMicros, row?.created_at))
		.map((row) => ({
			id: row.id,
			createdAt: row.created_at,
			expiresAt: row.expires_at,
			lastSeenAt: row.last_seen_at,
			authMethod: row.auth_method,
			ipPrefix: row.ip_prefix,
			userAgent: row.user_agent,
			current: String(row.id ?? '').toLowerCase() === currentId,
		}));
	sendJson(response, 200, { sessions }, config);
	return true;
}

async function revokeSession({ config, pg, kv, session, meta, sessionId }, response) {
	await rateLimit(kv, ['session-revoke', session.userId], { limit: REVOKE_LIMIT, windowMs: REVOKE_WINDOW_MS });
	await writeAudit(pg, { session, meta, eventType: 'session_revoke', details: { sessionId } });
	const params = new URLSearchParams({
		id: `eq.${sessionId}`,
		user_id: `eq.${session.userId}`,
		revoked_at: 'is.null',
		select: 'id,expires_at',
	});
	const rows = await pg.asService().patch(
		`osionos_sessions?${params}`,
		{ revoked_at: new Date(sessionClock(config)).toISOString(), revoked_reason: 'user' },
		{ prefer: 'return=representation' },
	);
	if (!Array.isArray(rows) || rows.length === 0) {
		throw sessionError(404, 'session_not_found', 'Session not found.');
	}
	// The revoked id and its expiry come from the rows the write returned: the id in the
	// path is the caller's wish, the row is the truth.
	for (const row of rows) {
		const revokedId = String(row?.id ?? '').toLowerCase();
		if (!revokedId) continue;
		config.sessionRevocations?.applyLocal(revokedId, timestampMicros(row?.expires_at) ?? 0);
	}
	response.writeHead(204, {
		'cache-control': 'no-store',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	response.end();
	return true;
}

/** The uuid of the session the path names, or the 422 a hostile path deserves. */
function sessionIdFrom(pathname) {
	try {
		return requireUuid(decodeURIComponent(pathname.slice('/api/account/sessions/'.length)), 'sessionId');
	} catch (error) {
		throw sessionError(422, 'invalid_session_id', error.message);
	}
}

/** The account routes of this module: GET /api/account/sessions and DELETE /api/account/sessions/:id. */
export function createSessionsRoutes({ config, pg, kv, verifySession }) {
	return async function handleAccountSessions(url, request, response) {
		const isList = request.method === 'GET' && url.pathname === '/api/account/sessions';
		const isRevoke = request.method === 'DELETE' && url.pathname.startsWith('/api/account/sessions/');
		if (!isList && !isRevoke) return false;
		const session = verifySession(bearerToken(request), config);
		if (!config.sessionRecords?.enabled) {
			throw sessionError(503, 'session_records_off', 'Session records are off on this bridge.');
		}
		const meta = sessionClientMeta(request, config);
		if (isList) return listSessions({ config, pg, session }, response);
		return revokeSession({ config, pg, kv, session, meta, sessionId: sessionIdFrom(url.pathname) }, response);
	};
}
