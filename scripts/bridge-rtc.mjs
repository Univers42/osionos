/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-rtc.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * LiveKit video-token endpoint for the osionos bridge — STANDALONE module
 * (node built-ins only, NO npm deps, does not import bridge-api.mjs).
 *
 * Route: POST /api/rtc/token
 *   headers: Authorization: Bearer <osionos app session token>
 *   body:    { channelId, room?, workspaceId?, displayName? }
 *   reply:   { ok, token, url, room, identity, workspaceId, role, expiresAt }
 *
 * Required env (wired on the osionos-bridge service in docker-compose.yml):
 *   LIVEKIT_API_KEY     — key id shared with the livekit SFU (default devkey)
 *   LIVEKIT_API_SECRET  — HS256 signing secret shared with the SFU (32+ chars)
 *   LIVEKIT_URL         — in-network server URL for admin/twirp calls
 *                         (default http://livekit:7880)
 *   LIVEKIT_CLIENT_URL  — browser-facing ws URL returned to the app
 *                         (default ws://127.0.0.1:7880)
 *
 * Wiring (the integrator owns bridge-api.mjs; this module stays standalone):
 *   import { createRtcTokenHandler } from './bridge-rtc.mjs';
 *   const handleRtc = createRtcTokenHandler({
 *     config,                              // configFromEnv() result
 *     verifySession: verifyAppSessionToken, // bridge-api's session helper
 *   });
 *   // inside handleBridgePost(...): if (await handleRtc(url, request, response)) return true;
 * `verifySession(token, config)` must return `{ userId, workspaceIds }` or
 * throw `{ status }` — exactly bridge-api.mjs#verifyAppSessionToken.
 *
 * ABAC: `authorizeRtcJoin` is THE single authorization hook. Today it resolves
 * the channel's workspace (osionos_channels when present, else the requested /
 * session workspace) and requires an osionos_workspace_members row. The chat
 * workstream tightens it to per-channel membership by replacing that one
 * function — handler and token shape stay untouched.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const MAX_TOKEN_TTL_SECONDS = 6 * 60 * 60; // LiveKit grants are capped at 6h here
const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60;
const NBF_SKEW_SECONDS = 10;
const RTC_BODY_LIMIT_BYTES = 16_384;
const REST_TIMEOUT_MS = 2_500;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function httpError(message, status) {
	return Object.assign(new Error(message), { status });
}

function safeText(value, limit) {
	return String(value ?? '')
		.normalize('NFKC')
		.replaceAll(/[\u0000-\u001f\u007f]/g, '')
		.trim()
		.slice(0, limit);
}

function base64urlJson(value) {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function rtcConfigFromEnv(env = process.env) {
	return {
		apiKey: safeText(env.LIVEKIT_API_KEY, 120),
		apiSecret: String(env.LIVEKIT_API_SECRET ?? ''),
		url: (env.LIVEKIT_URL ?? 'http://livekit:7880').replace(/\/$/, ''),
		clientUrl: (env.LIVEKIT_CLIENT_URL ?? 'ws://127.0.0.1:7880').replace(/\/$/, ''),
		tokenTtlSeconds: Math.min(
			Math.max(Number(env.LIVEKIT_TOKEN_TTL_SECONDS ?? DEFAULT_TOKEN_TTL_SECONDS) || DEFAULT_TOKEN_TTL_SECONDS, 60),
			MAX_TOKEN_TTL_SECONDS,
		),
	};
}

/**
 * Mint a LiveKit access token: a plain HS256 JWT (header {alg,typ}, payload
 * {iss: api key, sub: identity, name, nbf, exp, jti, video: grants}). The
 * default grant joins one room with publish+subscribe; pass `grants` to
 * override (e.g. `{ roomList: true }` for admin/twirp calls).
 */
export function mintLivekitToken({ apiKey, apiSecret, identity, name, room, grants, ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS, now = Date.now() }) {
	if (!apiKey || !apiSecret) throw httpError('LiveKit is not configured (LIVEKIT_API_KEY / LIVEKIT_API_SECRET).', 503);
	const issuedAt = Math.floor(now / 1000);
	const ttl = Math.min(Math.max(Number(ttlSeconds) || DEFAULT_TOKEN_TTL_SECONDS, 60), MAX_TOKEN_TTL_SECONDS);
	const payload = {
		iss: apiKey,
		sub: String(identity ?? ''),
		name: String(name ?? identity ?? ''),
		jti: randomUUID(),
		nbf: issuedAt - NBF_SKEW_SECONDS,
		iat: issuedAt,
		exp: issuedAt + ttl,
		video: grants ?? { room: String(room ?? ''), roomJoin: true, canPublish: true, canSubscribe: true },
	};
	const signingInput = `${base64urlJson({ alg: 'HS256', typ: 'JWT' })}.${base64urlJson(payload)}`;
	const signature = createHmac('sha256', apiSecret).update(signingInput).digest('base64url');
	return { token: `${signingInput}.${signature}`, expiresAt: new Date(payload.exp * 1000).toISOString() };
}

/** Verify an HS256 LiveKit token (used by the standalone test): checks the
 *  signature and expiry, returns the decoded payload or throws. */
export function verifyLivekitToken(token, apiSecret, now = Date.now()) {
	const [header, payload, signature, extra] = String(token ?? '').split('.');
	if (!header || !payload || !signature || extra !== undefined) throw httpError('LiveKit token is malformed.', 401);
	const expected = createHmac('sha256', String(apiSecret ?? '')).update(`${header}.${payload}`).digest('base64url');
	const left = Buffer.from(signature, 'utf8');
	const right = Buffer.from(expected, 'utf8');
	if (left.length !== right.length || !timingSafeEqual(left, right)) throw httpError('LiveKit token signature is invalid.', 401);
	const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
	if (!Number.isFinite(Number(decoded.exp)) || Number(decoded.exp) <= Math.floor(now / 1000)) {
		throw httpError('LiveKit token has expired.', 401);
	}
	return decoded;
}

async function baasRestGet(config, fetchImpl, path) {
	if (!config.baasUrl || !config.serviceKey) throw httpError('osionos BaaS service-role access is not configured.', 503);
	const response = await fetchImpl(`${config.baasUrl}/rest/v1/${path}`, {
		headers: { Accept: 'application/json', apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` },
		signal: AbortSignal.timeout(REST_TIMEOUT_MS),
	});
	if (!response.ok) throw httpError(`BaaS request failed with ${response.status}.`, response.status >= 500 ? 502 : response.status);
	return await response.json().catch(() => null);
}

/**
 * THE ABAC hook — single function on purpose so the chat workstream can
 * tighten it later (per-channel membership) without touching the handler.
 * Today: resolve the channel's workspace via osionos_channels when that table
 * exists (forward-compatible), else fall back to the requested/session
 * workspace, then REQUIRE an osionos_workspace_members row for the user.
 * Returns `{ workspaceId, role, permissions }` or throws 403.
 */
export async function authorizeRtcJoin({ userId, channelId, workspaceId, config, fetchImpl = fetch }) {
	let targetWorkspaceId = UUID_REGEX.test(String(workspaceId ?? '')) ? String(workspaceId) : '';
	if (UUID_REGEX.test(String(channelId ?? ''))) {
		try {
			const rows = await baasRestGet(config, fetchImpl, `osionos_channels?id=eq.${channelId}&select=workspace_id&limit=1`);
			const mapped = Array.isArray(rows) ? rows[0]?.workspace_id : undefined;
			if (typeof mapped === 'string' && UUID_REGEX.test(mapped)) targetWorkspaceId = mapped;
		} catch {
			// osionos_channels does not exist yet (chat workstream) — fall through
			// to the workspace-membership check below.
		}
	}
	if (!targetWorkspaceId) throw httpError('No workspace could be resolved for this channel.', 422);
	const members = await baasRestGet(
		config,
		fetchImpl,
		`osionos_workspace_members?workspace_id=eq.${targetWorkspaceId}&user_id=eq.${userId}&select=role,permissions&limit=1`,
	);
	const member = Array.isArray(members) ? members[0] : null;
	if (!member) throw httpError('You are not a member of this channel’s workspace.', 403);
	return {
		workspaceId: targetWorkspaceId,
		role: safeText(member.role, 16),
		permissions: Array.isArray(member.permissions) ? member.permissions.filter((item) => typeof item === 'string') : [],
	};
}

async function readJsonBody(request) {
	let body = '';
	for await (const chunk of request) {
		body += chunk;
		if (body.length > RTC_BODY_LIMIT_BYTES) throw httpError('Request body too large.', 413);
	}
	try {
		return body ? JSON.parse(body) : {};
	} catch {
		throw httpError('Request body must be JSON.', 400);
	}
}

function sendJson(response, status, body, config) {
	response.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	response.end(JSON.stringify(body));
}

function bearerTokenFromRequest(request) {
	const match = /^Bearer\s+(.+)$/i.exec(String(request.headers.authorization ?? ''));
	if (!match) throw httpError('App session bearer token is required.', 401);
	return match[1].trim();
}

/**
 * Build the POST /api/rtc/token handler in the bridge dispatch style:
 * `await handler(url, request, response)` → true when the route was handled.
 * deps: { config, verifySession, rtc?, fetchImpl?, authorize? } — `authorize`
 * defaults to authorizeRtcJoin (override point for tests / chat workstream).
 */
export function createRtcTokenHandler({ config, verifySession, rtc = rtcConfigFromEnv(), fetchImpl = fetch, authorize = authorizeRtcJoin }) {
	// `requestConfig` carries the per-request (per-origin) CORS config like the
	// chat/profile/feed handlers; service credentials still come from `config`.
	return async function handleRtcTokenPost(url, request, response, requestConfig = config) {
		if (url.pathname !== '/api/rtc/token' || request.method !== 'POST') return false;
		try {
			const session = verifySession(bearerTokenFromRequest(request), config);
			const payload = await readJsonBody(request);
			const channelId = safeText(payload.channelId, 120);
			if (!channelId) throw httpError('channelId is required.', 422);
			const room = safeText(payload.room, 128).replaceAll(/[^\w.-]/g, '-') || `channel-${channelId}`;
			const requestedWorkspaceId = safeText(payload.workspaceId, 80) || session.workspaceIds?.[0] || '';
			const membership = await authorize({
				userId: session.userId,
				channelId,
				workspaceId: requestedWorkspaceId,
				config,
				fetchImpl,
			});
			const name = safeText(payload.displayName, 80) || `user-${String(session.userId).slice(0, 8)}`;
			const { token, expiresAt } = mintLivekitToken({
				apiKey: rtc.apiKey,
				apiSecret: rtc.apiSecret,
				identity: session.userId,
				name,
				room,
				ttlSeconds: rtc.tokenTtlSeconds,
			});
			sendJson(response, 200, {
				ok: true,
				token,
				url: rtc.clientUrl,
				room,
				identity: session.userId,
				workspaceId: membership.workspaceId,
				role: membership.role,
				expiresAt,
			}, requestConfig);
		} catch (error) {
			sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'RTC token request failed.' }, requestConfig);
		}
		return true;
	};
}
