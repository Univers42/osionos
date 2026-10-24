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
 * A sign-in is a family: its row is the root (`family_id` = its own id), and every refresh
 * writes a child row (`parent_id` = the row it replaces) carrying a new access token. The
 * refresh token is single-use: presenting one that already has a child revokes the family.
 * Revoking a session revokes its whole family, because one device holds several access
 * tokens and revoking only one would leave it signed in through the next refresh.
 *
 * Caveat: the list shows one row per family, found by scanning at most MAX_LIST_PAGES pages
 * of live rows newest first — a user with more live generations than that (about a dozen
 * devices signed in for a week) loses the oldest families from the list, and rows created in
 * the same microsecond can straddle a page boundary. `last_seen_at` is never written (a
 * write per request is the P0-5 problem), and no reaper removes the rows of expired
 * sessions yet.
 */

import { randomUUID } from 'node:crypto';
import { clientMeta, rateLimit, writeAudit } from './bridge-guard.mjs';
import { familyRefreshExp, hashRefreshToken, mintRefreshToken, readRefreshToken, refreshTtlSeconds } from './bridge-refresh-token.mjs';
import { bearerToken, readJsonBody, requireUuid, sendJson } from './bridge-social-core.mjs';
import { assertAccountNotRefused } from './bridge-account-moderation.mjs';
import { platformRoleReader } from './bridge-roles.mjs';
import { kvBootLine, kvState } from './bridge-shared-store.mjs';
import { safeText, signAppSessionToken } from './bridge-session-token.mjs';
import { assertSessionNotCutOff } from './bridge-session-cutoff.mjs';
import { sessionRevocationsFromConfig } from './bridge-session-revocations.mjs';
import { timestampMicros } from './bridge-session-tracker.mjs';

const TOKEN_VERSION = 'osionos_v1';
const SESSION_COLUMNS = 'id,created_at,expires_at,last_seen_at,auth_method,ip_prefix,user_agent,family_id';
const LIST_LIMIT = 50;
const LIST_PAGE_SIZE = 500;
const MAX_LIST_PAGES = 10;
const REFRESH_LIMIT = 60;
const REFRESH_BODY_LIMIT_BYTES = 16_384;
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
		// Counts only, and only when OSIONOS_ACTIVITY=1 set the stats function on the config.
		...(config.activityStats ? { activity: config.activityStats() } : {}),
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
	return { jti, sub, iatMs, exp, payload: claims };
}

/** What the refresh token repeats of the access token it is minted beside (D2). */
function refreshClaimsFor(accessClaims, persona, config) {
	const { payload } = accessClaims;
	return {
		sub: accessClaims.sub,
		fam: accessClaims.jti,
		famIatMs: accessClaims.iatMs,
		jti: accessClaims.jti,
		familyExp: familyRefreshExp(config, accessClaims.exp),
		provider: safeText(payload.provider, 64),
		email: safeText(persona?.email, 320),
		name: safeText(persona?.name, 64),
		workspace_ids: payload.workspace_ids,
		roles: payload.roles,
		platform_role: payload.platform_role ?? null,
		is_admin: payload.is_admin === true,
		...(payload.mfa_req === true && payload.aal !== 2 ? { mfa_req: true } : {}),
	};
}

/**
 * Writes the row of the session that is being delivered, as the root of a new family. The
 * primary key is the token jti, so a row that already exists is a session that was already
 * delivered: a 409, never a silent overwrite. The raw refresh token is returned once and
 * only its hash is written.
 */
export async function recordSession(pg, { accessToken, authMethod, meta, config, persona } = {}) {
	if (!AUTH_METHODS.has(authMethod)) throw new TypeError('authMethod must be a known sign-in method.');
	const claims = decodeAccessToken(accessToken);
	const refresh = mintRefreshToken({ config, now: claims.iatMs, claims: refreshClaimsFor(claims, persona, config) });
	const row = {
		id: claims.jti,
		user_id: claims.sub,
		created_at: new Date(claims.iatMs).toISOString(),
		expires_at: new Date(claims.exp * 1000).toISOString(),
		auth_method: authMethod,
		ip_prefix: meta?.ipPrefix ?? null,
		ip_hash: meta?.ipHash ?? null,
		user_agent: meta?.userAgent ?? null,
		refresh_hash: refresh.hash,
		family_id: claims.jti,
	};
	await insertRow(pg, row);
	return { row, refreshToken: refresh.token };
}

async function insertRow(pg, row) {
	try {
		await pg.asService().post('osionos_sessions', row, { prefer: 'return=minimal' });
	} catch (error) {
		if (String(error?.upstreamCode) === '23505') {
			throw sessionError(409, 'session_record_conflict', 'This session was already recorded.');
		}
		throw sessionError(503, 'session_record_unavailable', 'The session could not be recorded; try again shortly.');
	}
}

/**
 * The row and refresh token of the session that is being delivered; nothing is written
 * while the records are off.
 */
export async function recordDeliveredSession(config, pg, { request, accessToken, authMethod, persona } = {}) {
	if (!config.sessionRecords?.enabled) return null;
	return recordSession(pg, { accessToken, authMethod, meta: sessionClientMeta(request, config), config, persona });
}

/**
 * The consume/login answer with the refresh token in it and the DELIVERED token's expiry:
 * the handoff's own 90 s expiry stays inside the handoff record, where the client would
 * otherwise persist it and drop a live session.
 */
export function deliveredAnswer(consumed, delivered) {
	const { exp } = decodeAccessToken(consumed.session.accessToken);
	return { ...consumed, session: { ...consumed.session, refreshToken: delivered?.refreshToken ?? '' }, expiresAt: exp * 1000 };
}

function liveSince(cutoffMicros, createdAt) {
	if (cutoffMicros === undefined || cutoffMicros === null) return true;
	const created = timestampMicros(createdAt);
	// An unreadable created_at is kept: the row is the user's, the cutoff is the coarse rule.
	return created === null || created >= cutoffMicros;
}

/**
 * Live rows, newest first, one page at a time: PostgREST has no DISTINCT to ask for families.
 * A row whose access token lives is listed; so is a family row inside the refresh window, as
 * its refresh token may still rotate (an idle sign-in stays revocable). A legacy row without
 * a family is never kept by the window: it has no refresh token.
 * Caveat: the window runs from the newest generation, not the family root, so a family rotated
 * near its end stays listed up to one access + refresh TTL after it died (revoking it is
 * harmless); a live family is never hidden.
 */
async function* liveRowPages({ config, pg, session, now }) {
	const windowSeconds = config.sessionTtlSeconds + (config.refreshTtlSeconds ?? refreshTtlSeconds());
	let before = null;
	for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
		const params = new URLSearchParams({
			select: SESSION_COLUMNS,
			revoked_at: 'is.null',
			or: `(expires_at.gt.${new Date(now).toISOString()},created_at.gt.${new Date(now - windowSeconds * 1000).toISOString()})`,
			order: 'created_at.desc',
			limit: String(LIST_PAGE_SIZE),
		});
		if (before) params.set('created_at', `lt.${before}`);
		const rows = await pg.asUser(session).get(`osionos_sessions?${params}`);
		const found = Array.isArray(rows) ? rows : [];
		yield found.filter((row) => row?.family_id != null || Date.parse(row?.expires_at) > now);
		if (found.length < LIST_PAGE_SIZE) return;
		before = found.at(-1)?.created_at;
		if (!before) return;
	}
}

async function currentRow({ pg, session, now, currentId }) {
	if (!currentId) return null;
	const params = new URLSearchParams({
		select: SESSION_COLUMNS,
		id: `eq.${currentId}`,
		revoked_at: 'is.null',
		expires_at: `gt.${new Date(now).toISOString()}`,
		limit: '1',
	});
	const rows = await pg.asUser(session).get(`osionos_sessions?${params}`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** One row per family: NULL family_id means the row is its own family (a legacy row). */
const familyKey = (row) => String(row.family_id ?? row.id).toLowerCase();

async function listFamilies({ config, pg, session }) {
	const now = sessionClock(config);
	const cutoffMicros = config.sessionCutoffs?.cutoffMicros?.(session.userId);
	const currentId = String(session.raw?.jti ?? '').toLowerCase();
	const families = new Map();
	for await (const rows of liveRowPages({ config, pg, session, now })) {
		for (const row of rows) {
			if (liveSince(cutoffMicros, row?.created_at) && !families.has(familyKey(row))) families.set(familyKey(row), row);
		}
		if (families.size >= LIST_LIMIT) break;
	}
	// The caller's own generation represents its family, wherever the scan stopped.
	const own = await currentRow({ pg, session, now, currentId });
	if (own && liveSince(cutoffMicros, own.created_at)) families.set(familyKey(own), own);
	return [...families.values()].slice(0, LIST_LIMIT + 1);
}

async function listSessions({ config, pg, session }, response) {
	const currentId = String(session.raw?.jti ?? '').toLowerCase();
	const sessions = (await listFamilies({ config, pg, session })).map((row) => ({
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

/**
 * Stamps every live row the filter selects as revoked and applies each id to this process
 * at once. The ids come from the rows the write returned, never from the request. The one
 * place a revoke is written, so the rows of a family and "everything but one family" can
 * never disagree on the stamp.
 */
async function stampRevoked({ config, pg }, params, reason) {
	const rows = await pg.asService().patch(
		`osionos_sessions?${params}`,
		{ revoked_at: new Date(sessionClock(config)).toISOString(), revoked_reason: reason },
		{ prefer: 'return=representation' },
	);
	const revoked = Array.isArray(rows) ? rows : [];
	for (const row of revoked) {
		const revokedId = String(row?.id ?? '').toLowerCase();
		if (revokedId) config.sessionRevocations?.applyLocal(revokedId, timestampMicros(row?.expires_at) ?? 0);
	}
	return revoked.length;
}

/** Revokes a family (or the one named row when it has no family). */
async function revokeFamily({ config, pg }, { userId, familyId, rowId, reason }) {
	const params = new URLSearchParams({ user_id: `eq.${userId}`, revoked_at: 'is.null', select: 'id,expires_at' });
	if (familyId) params.set('family_id', `eq.${familyId}`);
	else params.set('id', `eq.${rowId}`);
	return stampRevoked({ config, pg }, params, reason);
}

/**
 * Revokes every live row of the user except one family and the one row `keepRowId`, in a
 * single write. A row with no family (a legacy row) is its own family, so it is revoked
 * unless it is `keepRowId`; `keepFamilyId` defaults to `keepRowId`.
 * Caveat: PostgREST `neq` never matches NULL, hence the explicit `family_id.is.null` clause.
 */
export async function revokeOtherFamilies({ config, pg }, { userId, keepFamilyId, keepRowId, reason }) {
	const params = new URLSearchParams({
		user_id: `eq.${userId}`,
		revoked_at: 'is.null',
		id: `neq.${keepRowId}`,
		or: `(family_id.is.null,family_id.neq.${keepFamilyId ?? keepRowId})`,
		select: 'id,expires_at',
	});
	return stampRevoked({ config, pg }, params, reason);
}

async function liveRowOf(pg, { sessionId, userId }) {
	const params = new URLSearchParams({
		id: `eq.${sessionId}`,
		user_id: `eq.${userId}`,
		revoked_at: 'is.null',
		select: 'id,family_id',
		limit: '1',
	});
	const rows = await pg.asService().get(`osionos_sessions?${params}`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function revokeSession({ config, pg, kv, session, meta, sessionId }, response) {
	await rateLimit(kv, ['session-revoke', session.userId], { limit: REVOKE_LIMIT, windowMs: REVOKE_WINDOW_MS });
	await writeAudit(pg, { session, meta, eventType: 'session_revoke', details: { sessionId } });
	// "Not yours" and "already revoked" are the same 404: the read carries the caller's id.
	const row = await liveRowOf(pg, { sessionId, userId: session.userId });
	const revoked = row ? await revokeFamily({ config, pg }, { userId: session.userId, familyId: row.family_id, rowId: row.id, reason: 'user' }) : 0;
	if (revoked === 0) throw sessionError(404, 'session_not_found', 'Session not found.');
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

const HOLDER_COLUMNS = 'id,user_id,family_id,created_at,revoked_at,ip_prefix,ip_hash,user_agent';

/** The row that issued this refresh token, read straight from the table: no polled set, so a revoke bites on every replica at once. */
async function holderOf(pg, token) {
	const params = new URLSearchParams({ refresh_hash: `eq.${hashRefreshToken(token)}`, select: HOLDER_COLUMNS, limit: '1' });
	const rows = await pg.asService().get(`osionos_sessions?${params}`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function hasChild(pg, rowId) {
	const params = new URLSearchParams({ parent_id: `eq.${rowId}`, select: 'id', limit: '1' });
	const rows = await pg.asService().get(`osionos_sessions?${params}`);
	return Array.isArray(rows) && rows.length > 0;
}

const sameText = (left, right) => String(left ?? '').toLowerCase() === String(right ?? '').toLowerCase();

/** The token and the row it names must agree, and a mismatch says nothing about the other account. */
function assertHolds(holder, payload) {
	if (!holder || !sameText(holder.user_id, payload.sub) || !sameText(holder.id, payload.jti) || !sameText(holder.family_id, payload.fam)) {
		throw sessionError(401, 'refresh_token_invalid', 'The refresh token is not valid.');
	}
}

/** A consumed token came back: someone else holds a copy, so the whole family dies. */
async function answerReuse({ config, pg, meta }, holder) {
	const session = { userId: String(holder.user_id).toLowerCase(), raw: { jti: holder.id } };
	try {
		await writeAudit(pg, { session, meta, eventType: 'session_refresh_reuse', details: { sessionId: holder.id } });
	} catch (error) {
		// Revoking is the safety action: an unavailable audit must not keep a stolen family alive.
		console.warn(`[osionos-bridge] refresh reuse could not be audited: ${error.code ?? 'audit_failed'}`);
	}
	await revokeFamily({ config, pg }, { userId: session.userId, familyId: holder.family_id, rowId: holder.id, reason: 'refresh_reuse' });
	throw sessionError(401, 'refresh_token_reused', 'This sign-in was used elsewhere; sign in again.');
}

/**
 * The next access token and refresh token. Identity (subject, provider, private workspace)
 * comes from the old refresh token; rights (admin flag, platform role, member workspaces)
 * come from `fresh`, read just now, so a demotion bites at the next rotation.
 */
function nextTokens({ config, now, payload, fresh }) {
	const jti = randomUUID();
	const provider = safeText(payload.provider, 64);
	const extras = fresh.memberWorkspaces.filter((entry) => entry?._id);
	const roles = Object.fromEntries([[payload.workspace_ids[0], payload.roles[payload.workspace_ids[0]] || 'owner'], ...extras.map((entry) => [entry._id, entry.role || 'member'])]);
	const rights = { platform_role: fresh.platformRole ?? null, is_admin: fresh.isAdmin === true };
	const access = signAppSessionToken({
		payload: { subject: payload.sub, provider },
		workspace: { _id: payload.workspace_ids[0] },
		config,
		now,
		jti,
		memberWorkspaces: extras,
		platformRole: rights.platform_role,
		isAdmin: rights.is_admin,
		// A refresh never raises assurance: a gated family stays aal1 until it steps up again.
		...(payload.mfa_req === true ? { aal: 1, mfaReq: true } : {}),
		// Never past the family's own expiry: the last rotation before it gets a shorter token.
		exp: Math.min(Math.floor(now / 1000) + config.sessionTtlSeconds, payload.exp),
	});
	const claims = { ...payload, ...rights, workspace_ids: [payload.workspace_ids[0], ...extras.map((entry) => entry._id)], roles, famIatMs: payload.fam_iat_ms, jti, familyExp: payload.exp, provider };
	return { jti, access, refresh: mintRefreshToken({ config, now, claims }) };
}

function childRow({ holder, tokens, now }) {
	return {
		id: tokens.jti,
		user_id: holder.user_id,
		created_at: new Date(now).toISOString(),
		expires_at: tokens.access.expiresAt,
		auth_method: 'refresh',
		// The same client, so the metadata is copied: this request may come from anywhere.
		ip_prefix: holder.ip_prefix ?? null,
		ip_hash: holder.ip_hash ?? null,
		user_agent: holder.user_agent ?? null,
		family_id: holder.family_id,
		parent_id: holder.id,
		refresh_hash: tokens.refresh.hash,
	};
}

/**
 * Rotates a refresh token. The audit row comes before the INSERT and the reuse check before
 * both, so a failed rotation leaves the old token usable and the client may retry.
 *
 * Caveat: the rate limit is per family and runs after the signature check, so a token that
 * does not verify costs one HMAC and is never counted; a stolen family's own bucket is the
 * only brake on its holder.
 */
async function refreshSession({ config, pg, kv, request, readRefreshClaims }, response) {
	if (!config.sessionRecords?.enabled) throw sessionError(503, 'session_records_off', 'Session records are off on this bridge.');
	const meta = sessionClientMeta(request, config);
	const body = await readJsonBody(request, REFRESH_BODY_LIMIT_BYTES);
	const presented = typeof body?.refreshToken === 'string' ? body.refreshToken.trim() : '';
	if (!presented) throw sessionError(422, 'refresh_token_required', 'A refresh token is required.');
	const now = sessionClock(config);
	const read = readRefreshToken(presented, config, now);
	if (!read.payload) throw sessionError(401, read.code, 'The refresh token is not valid.');
	const { payload } = read;
	// After the signature check: unsigned garbage cannot spend a legitimate family's bucket.
	await rateLimit(kv, ['session-refresh', payload.fam], { limit: REFRESH_LIMIT, windowMs: REVOKE_WINDOW_MS });
	const holder = await holderOf(pg, presented);
	assertHolds(holder, payload);
	if (holder.revoked_at) throw sessionError(401, 'session_revoked', 'This session was signed out.');
	// The family's own sign-in instant, signed into the token: a child written by a replica
	// that had not polled the cut-off yet cannot outlive a logout-everywhere.
	assertSessionNotCutOff(config.sessionCutoffs, payload.sub, payload.fam_iat_ms);
	if (await hasChild(pg, holder.id)) return answerReuse({ config, pg, meta }, holder);
	await assertAccountNotRefused(platformRoleReader(pg), payload.sub, now);
	const fresh = await readRefreshClaims(payload);
	await writeAudit(pg, { session: { userId: payload.sub, raw: { jti: holder.id } }, meta, eventType: 'session_refresh', details: { sessionId: holder.id } });
	const tokens = nextTokens({ config, now, payload, fresh });
	try {
		await pg.asService().post('osionos_sessions', childRow({ holder, tokens, now }), { prefer: 'return=minimal' });
	} catch (error) {
		// parent_id is unique: losing the race to a concurrent rotation is a second use of the token.
		if (String(error?.upstreamCode) === '23505') return answerReuse({ config, pg, meta }, holder);
		throw sessionError(503, 'session_record_unavailable', 'The session could not be refreshed; try again shortly.');
	}
	await refuseIfRevokedMeanwhile({ config, pg }, holder, tokens.jti);
	sendJson(response, 200, { accessToken: tokens.access.token, refreshToken: tokens.refresh.token, expiresAt: Date.parse(tokens.access.expiresAt) }, config);
	return true;
}

/**
 * The family may have been revoked between the holder read and the insert; the revoke only
 * touched the rows that existed then, so the child is revoked here with the same reason.
 * Caveat: a revoke landing after this read, before the answer, leaves the child live until
 * its next use (the next refresh reads the revoke of its parent, which the revoke wrote).
 */
async function refuseIfRevokedMeanwhile({ config, pg }, holder, childId) {
	const params = new URLSearchParams({ id: `eq.${holder.id}`, select: 'revoked_at,revoked_reason', limit: '1' });
	const rows = await pg.asService().get(`osionos_sessions?${params}`);
	const parent = Array.isArray(rows) ? rows[0] : null;
	if (!parent?.revoked_at) return;
	await revokeFamily({ config, pg }, { userId: String(holder.user_id).toLowerCase(), familyId: holder.family_id, rowId: childId, reason: parent.revoked_reason || 'user' });
	throw sessionError(401, 'session_revoked', 'This session was signed out.');
}

/**
 * The routes of this module: GET /api/account/sessions, DELETE /api/account/sessions/:id,
 * and POST /api/auth/bridge/refresh, which takes no session token (the refresh token in the
 * body is the credential and an Authorization header is never an alternative).
 */
export function createSessionsRoutes({ config, pg, kv, verifySession, readRefreshClaims }) {
	return async function handleAccountSessions(url, request, response) {
		if (request.method === 'POST' && url.pathname === '/api/auth/bridge/refresh') {
			return refreshSession({ config, pg, kv, request, readRefreshClaims }, response);
		}
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
