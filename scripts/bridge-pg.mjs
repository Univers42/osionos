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
 *
 * The paging primitives live here because the account lists share them: `idChunks` keeps
 * `in.(…)` under Kong's header buffer, and `keyset`/`pageOf` page by an ordered tuple
 * without an offset scan.
 */

import { signRealtimeJwt } from './bridge-realtime-socket.mjs';
import { BAAS_FETCH_TIMEOUT_MS, readBaasJson } from './bridge-baas-body.mjs';

export const ACCOUNT_JWT_AUDIENCE = 'osionos-account';
export const ACCOUNT_DB_ROLE = 'osionos_account_user';
export const ACCOUNT_JWT_TTL_SECONDS = 120;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]*$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_CURSOR_LENGTH = 512;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_LIMIT = 100;

// Every message is fixed: a PostgREST 409 detail can quote another row's values, and route
// handlers return `error.message` to the browser (bridge-realtime-token.mjs:96).
const ERROR_MESSAGES = {
	invalid_request: 'The account request is invalid.',
	forbidden: 'Account data access is forbidden.',
	not_found: 'Account data was not found.',
	conflict: 'The account data request conflicts with the current state.',
	rate_limited: 'Account data requests are rate limited.',
	account_plane_unavailable: 'The account plane is unavailable.',
	baas_failed: 'Account data request failed.',
	baas_unreachable: 'The account plane could not be reached.',
	baas_unconfigured: 'The account plane is not configured.',
};
const SERVICE_STATUS = { 400: [422, 'invalid_request'], 401: [403, 'forbidden'], 403: [403, 'forbidden'], 404: [404, 'not_found'], 409: [409, 'conflict'], 429: [429, 'rate_limited'] };
const USER_STATUS = { 400: [422, 'invalid_request'], 401: [503, 'account_plane_unavailable'], 403: [503, 'account_plane_unavailable'], 404: [503, 'account_plane_unavailable'], 409: [409, 'conflict'], 429: [429, 'rate_limited'] };

function pgError(status, code, extra) {
	return Object.assign(new Error(ERROR_MESSAGES[code] ?? 'Account data request failed.'), { status, code }, extra);
}

const has = (value) => value !== undefined && value !== null && value !== '';

/** HS256 account token; `role` is the boundary PostgREST switches on. */
export function mintAccountJwt({ userId, sessionId, secret, nowMs = Date.now(), ttlSeconds = ACCOUNT_JWT_TTL_SECONDS } = {}) {
	if (typeof secret !== 'string' || secret.trim() === '') throw pgError(503, 'account_plane_unavailable');
	if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) throw pgError(400, 'invalid_subject');
	const iat = Math.floor(nowMs / 1000);
	const claims = { iss: 'supabase', aud: ACCOUNT_JWT_AUDIENCE, role: ACCOUNT_DB_ROLE, sub: userId };
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

// Layer one rejects the shapes that must never reach `new URL`; layer two proves the
// resolved path still lives under the configured base, because URL normalisation decodes
// `%2E%2e` and a crafted segment would otherwise land on GoTrue's admin API.
const UNSAFE_PATH = /^\/|\.\.|:\/\/|\\|%2e|%2f|%5c|[\x00-\x1f\x7f]/i;

function buildUrl(base, path) {
	if (typeof path !== 'string' || UNSAFE_PATH.test(path)) throw new TypeError('PostgREST path is not allowed.');
	const url = new URL(`${base}/${path}`);
	const baseUrl = new URL(base);
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
	const table = kind === 'user' ? USER_STATUS : SERVICE_STATUS;
	const [status, code] = table[response.status] ?? [502, 'baas_failed'];
	return pgError(status, code, {
		upstreamStatus: response.status,
		upstreamText: text.slice(0, 160),
		upstreamCode: codeFromBody(text),
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

// Caveat: 50 was measured with unquoted ids (bridge-api.mjs:1371-1379). `inFilter` adds 6
// bytes per id for quotes and encoding, so 50 uuids are ~2.15 KB instead of ~1.85 KB,
// leaving ~1.5 KB of Kong's 4 KB header buffer for the rest of the query string.
export function idChunks(ids, size = 50) {
	if (!Array.isArray(ids)) throw new TypeError('idChunks expects an array of ids.');
	if (!Number.isInteger(size) || size < 1 || size > 500) throw new RangeError('chunk size must be an integer from 1 to 500.');
	const unique = [];
	const seen = new Set();
	for (const id of ids) {
		if (!has(id) || seen.has(id)) continue;
		seen.add(id);
		unique.push(id);
	}
	const chunks = [];
	for (let at = 0; at < unique.length; at += size) chunks.push(unique.slice(at, at + size));
	return chunks;
}

function quoteFilterValue(value) {
	const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return encodeURIComponent(`"${escaped}"`);
}

/** PostgREST `in` filter with quoted values, so commas and parentheses stay inside an id. */
export function inFilter(column, ids) {
	if (typeof column !== 'string' || !IDENTIFIER_PATTERN.test(column)) throw new TypeError('filter column must be a plain postgres identifier.');
	if (!Array.isArray(ids) || ids.length === 0) throw new TypeError('inFilter needs at least one id.');
	return `${column}=in.(${ids.map(quoteFilterValue).join(',')})`;
}

// Caveat: the cursor is not signed. Tampering only moves the page start; it can never
// widen the rows a caller may see, because every filter is still applied server-side.
export function encodeCursor(values) {
	return Buffer.from(JSON.stringify(values)).toString('base64url');
}

export function decodeCursor(token, arity) {
	const invalid = () => pgError(422, 'invalid_cursor');
	if (typeof token !== 'string' || token.length > MAX_CURSOR_LENGTH || !BASE64URL_PATTERN.test(token)) throw invalid();
	let values;
	try {
		values = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
	} catch {
		throw invalid();
	}
	if (!Array.isArray(values) || values.length !== arity) throw invalid();
	for (const value of values) {
		if (typeof value === 'string') continue;
		if (typeof value === 'number' && Number.isFinite(value)) continue;
		throw invalid();
	}
	return values;
}

function normalizeOrder(order) {
	if (!Array.isArray(order) || order.length < 1 || order.length > 3) throw new TypeError('keyset order must name 1 to 3 columns.');
	return order.map((entry) => {
		if (!Array.isArray(entry) || entry.length !== 2) throw new TypeError('each keyset order entry is [column, direction].');
		const [column, direction] = entry;
		if (typeof column !== 'string' || !IDENTIFIER_PATTERN.test(column)) throw new TypeError('keyset column must be a plain postgres identifier.');
		if (direction !== 'asc' && direction !== 'desc') throw new TypeError("keyset direction must be 'asc' or 'desc'.");
		return [column, direction];
	});
}

function keysetFilter(order, cursor) {
	const terms = order.map(([column, direction], index) => {
		const operator = direction === 'desc' ? 'lt' : 'gt';
		const equalities = order.slice(0, index).map(([prefix], at) => `${prefix}.eq.${quoteFilterValue(cursor[at])}`);
		equalities.push(`${column}.${operator}.${quoteFilterValue(cursor[index])}`);
		return index === 0 ? equalities[0] : `and(${equalities.join(',')})`;
	});
	return `(${terms.join(',')})`;
}

function resolveTake(limit, maxLimit) {
	const cap = Number.isFinite(Number(maxLimit)) ? Math.max(1, Math.trunc(Number(maxLimit))) : DEFAULT_MAX_LIMIT;
	const parsed = limit === undefined || limit === null ? NaN : Number(limit);
	const value = Number.isFinite(parsed) ? Math.trunc(parsed) : DEFAULT_PAGE_SIZE;
	return Math.min(Math.max(value, 1), cap);
}

/**
 * Lexicographic `or=(…)` page filter. Every order column must be NOT NULL in the table:
 * a null in the tuple makes the comparison skip the row, so the next page would drop it.
 * The last entry is the unique tie-breaker.
 */
export function keyset({ order, cursor, limit, maxLimit = DEFAULT_MAX_LIMIT } = {}) {
	const normalized = normalizeOrder(order);
	const hasCursor = has(cursor);
	if (hasCursor && (!Array.isArray(cursor) || cursor.length !== normalized.length)) {
		throw new TypeError('keyset cursor must carry one value per order column.');
	}
	const take = resolveTake(limit, maxLimit);
	const ordered = normalized.map(([column, direction]) => `${column}.${direction}`).join(',');
	let query = `order=${ordered}&limit=${take + 1}`;
	if (hasCursor) query += `&or=${keysetFilter(normalized, cursor)}`;
	return { query, take };
}

// Caveat: numbers travel through JSON, so a bigint column above 2^53 loses precision.
// Page by a uuid or timestamptz tie-breaker, never by a raw bigint id.
export function pageOf(rows, order, take) {
	if (!Array.isArray(rows)) throw new TypeError('pageOf expects an array of rows.');
	if (!Number.isInteger(take) || take < 1) throw new TypeError('pageOf take must be a positive integer.');
	const items = rows.slice(0, take);
	if (rows.length <= take) return { items, nextCursor: null };
	const edge = rows[take - 1];
	const values = order.map(([column]) => {
		const value = edge?.[column];
		if (value === null || value === undefined) throw new TypeError(`order column ${column} is null on the cursor row.`);
		return value;
	});
	return { items, nextCursor: encodeCursor(values) };
}
