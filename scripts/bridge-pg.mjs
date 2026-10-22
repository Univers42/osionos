/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-pg.mjs                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * PostgREST access for the account plane. `asService` keeps the service-role reach the
 * bridge already has; `asUser` mints a short-lived token per request so Postgres RLS can
 * enforce `user_id = osionos_account_uid()` even when a route forgets its `user_id=eq.`
 * filter. The service key never enters an `asUser` request.
 */

import { signRealtimeJwt } from './bridge-realtime-socket.mjs';
import { BAAS_FETCH_TIMEOUT_MS, readBaasJson } from './bridge-baas-body.mjs';

export const ACCOUNT_JWT_AUDIENCE = 'osionos-account';
export const ACCOUNT_DB_ROLE = 'osionos_account_user';
export const ACCOUNT_JWT_TTL_SECONDS = 120;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;

// Every message is fixed: a PostgREST 409 detail can quote another row's values, and route
// handlers return `error.message` to the browser (bridge-realtime-token.mjs:96).
const ERROR_MESSAGES = {
	invalid_request: 'The account request is invalid.',
	forbidden: 'Account data access is forbidden.',
	not_found: 'Account data was not found.',
	conflict: 'The account data request conflicts with the current state.',
	rate_limited: 'Account data requests are rate limited.',
	account_plane_unavailable: 'The account plane is unavailable.',
	invalid_subject: 'The account subject is invalid.',
	invalid_cursor: 'The paging cursor is invalid.',
	baas_failed: 'Account data request failed.',
	baas_unreachable: 'The account plane could not be reached.',
	baas_unconfigured: 'The account plane is not configured.',
};
const SERVICE_STATUS = { 400: [422, 'invalid_request'], 401: [403, 'forbidden'], 403: [403, 'forbidden'], 404: [404, 'not_found'], 409: [409, 'conflict'], 429: [429, 'rate_limited'] };
const USER_STATUS = { 400: [422, 'invalid_request'], 401: [503, 'account_plane_unavailable'], 403: [503, 'account_plane_unavailable'], 404: [503, 'account_plane_unavailable'], 409: [409, 'conflict'], 429: [429, 'rate_limited'] };

/** The shared error shape: a fixed message plus the status/code route handlers map. */
export function pgError(status, code, extra) {
	return Object.assign(new Error(ERROR_MESSAGES[code] ?? 'Account data request failed.'), { status, code }, extra);
}

const has = (value) => value !== undefined && value !== null && value !== '';

/** HS256 account token; `role` is the boundary PostgREST switches on. */
export function mintAccountJwt({ userId, sessionId, secret, nowMs = Date.now(), ttlSeconds = ACCOUNT_JWT_TTL_SECONDS } = {}) {
	if (typeof secret !== 'string' || secret.trim() === '') throw pgError(503, 'account_plane_unavailable');
	if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) throw pgError(400, 'invalid_subject');
	const iat = Math.floor(nowMs / 1000);
	const claims = { iss: 'supabase', aud: ACCOUNT_JWT_AUDIENCE, role: ACCOUNT_DB_ROLE, sub: userId.toLowerCase() };
	if (has(sessionId)) claims.sid = sessionId;
	claims.iat = iat;
	claims.exp = iat + ttlSeconds;
	return signRealtimeJwt(claims, secret);
}

function resolveBase(config, env) {
	const override = String(env.OSIONOS_POSTGREST_URL ?? '').trim();
	if (override) return override.replace(/\/$/, '');
	return `${String(config.baasUrl ?? '').replace(/\/$/, '')}/rest/v1`;
}

// Layer one guards the path part only: a query value may legitimately carry encoded `/`,
// `\` or `..`, and the parser never normalises a query into the path. Layer two proves the
// resolved path still lives under the configured base (a crafted `%2E%2e` would not).
const UNSAFE_PATH = /(?:^\/)|\.\.|:\/\/|\\|%2e|%2f|%5c/i;
const CONTROL_CHAR = /[\x00-\x1f\x7f]/;

function buildUrl(base, path) {
	if (typeof path !== 'string') throw new TypeError('PostgREST path is not allowed.');
	let baseUrl;
	try { baseUrl = new URL(base); } catch { throw pgError(503, 'baas_unconfigured'); }
	const queryAt = path.indexOf('?');
	const pathOnly = queryAt === -1 ? path : path.slice(0, queryAt);
	if (pathOnly === '' || UNSAFE_PATH.test(pathOnly) || CONTROL_CHAR.test(path)) throw new TypeError('PostgREST path is not allowed.');
	const url = new URL(`${base}/${path}`);
	const prefix = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`;
	if (url.origin !== baseUrl.origin || !url.pathname.startsWith(prefix)) throw new TypeError('PostgREST path escapes the configured base.');
	return url.toString();
}

function codeFromBody(text) {
	try {
		const parsed = JSON.parse(text);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.code ?? undefined : undefined;
	} catch {
		return undefined;
	}
}

async function upstreamFailure(kind, response) {
	const text = await response.text().catch(() => '');
	const upstreamCode = codeFromBody(text);
	const table = kind === 'user' ? USER_STATUS : SERVICE_STATUS;
	// A missing osionos_account_user role is setup, not the caller's bad input (SQLSTATE 22023).
	const roleMissing = kind === 'user' && String(upstreamCode) === '22023';
	const [status, code] = roleMissing ? [503, 'account_plane_unavailable'] : table[response.status] ?? [502, 'baas_failed'];
	return pgError(status, code, {
		upstreamStatus: response.status,
		upstreamText: text.slice(0, 160),
		upstreamCode,
	});
}

function makeClient({ base, kind, authHeaders, fetchImpl, timeoutMs }) {
	async function request(method, path, body, opts) {
		const url = buildUrl(base, path);
		// Minting and the path guard throw before the fetch: only the transport itself may
		// become baas_unreachable.
		const headers = authHeaders();
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		if (opts?.prefer) headers.Prefer = opts.prefer;
		let response;
		try {
			response = await fetchImpl(url, {
				method,
				headers,
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch {
			throw pgError(503, 'baas_unreachable');
		}
		if (!response.ok) throw await upstreamFailure(kind, response);
		const service = kind === 'user' ? 'account PostgREST (user)' : 'account PostgREST (service)';
		return readBaasJson(response, { service, empty: null, fail: () => pgError(502, 'baas_failed') });
	}

	return {
		get: (path) => request('GET', path),
		post: (path, body, opts) => request('POST', path, body, opts),
		patch: (path, body, opts) => request('PATCH', path, body, opts),
		del: (path, opts) => request('DELETE', path, undefined, opts),
		async rpc(fn, args) {
			if (typeof fn !== 'string' || !IDENTIFIER_PATTERN.test(fn)) throw new TypeError('rpc name must be a plain postgres identifier.');
			return request('POST', `rpc/${fn}`, args);
		},
	};
}

/** One account-plane client pair. `now` is milliseconds, so tests can pin the token clock. */
export function createPg({ config, env = process.env, fetchImpl = fetch, timeoutMs = BAAS_FETCH_TIMEOUT_MS, now = Date.now }) {
	const base = resolveBase(config ?? {}, env ?? {});
	const serviceKey = String(config?.serviceKey ?? '');
	const publicApiKey = String(config?.publicApiKey ?? '');

	const asService = () => {
		if (!serviceKey) throw pgError(503, 'baas_unconfigured');
		return makeClient({
			base,
			kind: 'service',
			authHeaders: () => ({ Accept: 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }),
			fetchImpl,
			timeoutMs,
		});
	};

	const asUser = (session) => makeClient({
		base,
		kind: 'user',
		authHeaders: () => {
			const jti = session?.raw?.jti;
			const sessionId = typeof jti === 'string' && UUID_PATTERN.test(jti) ? jti : undefined;
			const token = mintAccountJwt({ userId: session?.userId, sessionId, secret: env?.JWT_SECRET, nowMs: now() });
			const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
			if (publicApiKey) headers.apikey = publicApiKey;
			return headers;
		},
		fetchImpl,
		timeoutMs,
	});

	return { asService, asUser };
}
