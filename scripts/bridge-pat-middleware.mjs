/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-pat-middleware.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Bearer middleware of the personal access tokens. A request whose Authorization is an
 * `osio_pat_` secret is looked up by its sha256, refused with one answer for every bad token,
 * checked against the two page routes a PAT may reach and the scope it carries, and exchanged
 * for a 120-second internal session cut by the token's mask. Routes see that session, never
 * the PAT: the header is rewritten before any of them reads it.
 *
 * The mask is applied here and nowhere else: to the response of a read, and (through
 * `patWritePayload`, called by the route's body reader) to the payload of a write.
 *
 * Caveat: the response mask fails closed — a 2xx body that is not a JSON object, an empty
 * one, or a route that streams, is answered 500 and never forwarded — so a future route added
 * to PAT_ROUTES that answers a list or a stream is refused until it is taught here.
 * Caveat: the hourly claim of `last_used_at` is stamped before the audit row is written and
 * released if that write fails; a crash between the two, or a failed release, leaves the stamp
 * in place and loses that hour's row (the failed release is only logged; the hour stays unaudited).
 * Caveat: the per-client bucket keys on the client-address hash (or its /24 prefix), so clients
 * behind one NAT share a bucket and a fresh address gets a fresh one; it bounds work, not abuse.
 * Caveat: denial rows are throttled through the kv store (one per token and outcome per hour);
 * on a bridge without a shared store each replica writes its own.
 * Caveat: the gate sees only the Authorization header; a PAT sent in the query string or a
 * cookie is not a PAT here, and is refused by the routes as any malformed session.
 */

import { randomUUID } from 'node:crypto';
import { clientMeta, rateLimit, writeAudit } from './bridge-guard.mjs';
import { attributesOutsideMask, evaluatePat, maskAttributes } from './bridge-pat-permissions.mjs';
import { findPatByHash, hashPatSecret, isPatSecret, PAT_PREFIX } from './bridge-pat-store.mjs';
import { signAppSessionToken } from './bridge-session-token.mjs';

const PAT_TABLE = 'osionos_personal_access_tokens';
const PAT_SESSION_TTL_SECONDS = 120;
const AUDIT_WINDOW_MS = 3_600_000;
const PAGE_PATH = /^\/api\/pages\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWNED_WORKSPACE_LIMIT = 100;
const DEFAULT_RATE_LIMIT = { limit: 120, windowMs: 60_000 };
const PAT_LIKE_PREFIX = 'osio_';
const CONTROL_FIELDS = new Set(['baseVersion']);

/** The whole surface a PAT reaches: read one page, change one page. */
export const PAT_ROUTES = [
	{ method: 'GET', path: PAGE_PATH, resource: 'pages', permission: 'read' },
	{ method: 'PATCH', path: PAGE_PATH, resource: 'pages', permission: 'write' },
];

const failure = (status, code, message) => Object.assign(new Error(message), { status, code });

/**
 * The write-set check: a payload naming an attribute outside the mask is refused whole, so a
 * client is never told a field was saved when it was not. `baseVersion` is a control field of
 * the route, not a page attribute, and rides through.
 */
export function patWritePayload(payload, mask) {
	const isObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload);
	if (!isObject) throw failure(422, 'pat_invalid_body', 'The request body must be a JSON object.');
	const outside = attributesOutsideMask(payload, mask).filter((key) => !CONTROL_FIELDS.has(key));
	if (outside.length > 0) throw failure(403, 'pat_forbidden_attribute', `This token may not change: ${outside.join(', ')}.`);
	return payload;
}

function headersWithout(headers, name) {
	return Object.fromEntries(Object.entries(headers ?? {}).filter(([key]) => key.toLowerCase() !== name));
}

const FIXED_MESSAGES = new Map([
	[400, 'The request was not accepted.'],
	[401, 'Not authorized.'],
	[403, 'Not allowed.'],
	[404, 'Not found.'],
	[409, 'The page changed; reload and retry.'],
	[422, 'The request body was not valid.'],
	[429, 'Too many requests.'],
]);
const fixedMessage = (status) => FIXED_MESSAGES.get(status) ?? (status >= 500 ? 'The service is unavailable; try again.' : 'The request failed.');

/**
 * A route error reaches a PAT client as its code plus a fixed sentence per status: the route's
 * own message can quote upstream text (PostgREST repeats the failing row), which sits outside
 * the mask. `details` carries page attributes (the 409 returns the stored content) and is held
 * to the token's READ mask; `version` rides with `content`.
 * Caveat: only a JSON object body is rewritten; a non-JSON error body passes through, which is
 * safe only while routes answer errors through errorJson.
 */
function maskErrorBody(text, status, readMask) {
	try {
		const parsed = JSON.parse(text);
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return text;
		const body = { ...parsed };
		if (Object.hasOwn(body, 'message')) body.message = fixedMessage(status);
		if (body.details && typeof body.details === 'object') {
			const allowed = Array.isArray(readMask) ? [...readMask] : [];
			if (allowed.includes('content')) allowed.push('version');
			body.details = maskAttributes(body.details, allowed);
		}
		return JSON.stringify(body);
	} catch {
		return text;
	}
}

/**
 * The write reply is an allow-list, not a mask: `version` follows the read of `content` (as in
 * the 409) and `cascadedIds`, the ids of descendant pages, follows the read of `archivedAt`.
 */
function writeReply(parsed, readMask) {
	const read = Array.isArray(readMask) ? readMask : [];
	const kept = {};
	for (const key of ['ok', 'updatedAt', 'ignored']) if (Object.hasOwn(parsed, key)) kept[key] = parsed[key];
	if (read.includes('content') && Object.hasOwn(parsed, 'version')) kept.version = parsed.version;
	if (read.includes('archivedAt') && Object.hasOwn(parsed, 'cascadedIds')) kept.cascadedIds = parsed.cascadedIds;
	return kept;
}

/**
 * Hold a route's response back, mask it, then send it. Only the route's own head and body are
 * captured. A 2xx body is masked to `mask`, or with `isWrite` cut to the write reply allow-list
 * by the read mask; a non-2xx body goes through maskErrorBody.
 */
export function installResponseMask(response, mask, { readMask = mask, isWrite = false } = {}) {
	const send = response.writeHead.bind(response);
	const finish = response.end.bind(response);
	let head = null;
	response.writeHead = (status, headers) => {
		head = { status, headers: headers ?? {} };
		return response;
	};
	response.write = () => {
		throw failure(500, 'pat_route_streams', 'A masked route may not stream.');
	};
	response.end = (body) => {
		const text = body === undefined || body === null ? '' : String(body);
		const { status, headers } = head ?? { status: 200, headers: {} };
		const kept = headersWithout(headers, 'content-length');
		if (status < 200 || status >= 300) {
			send(status, kept);
			return finish(maskErrorBody(text, status, readMask));
		}
		try {
			const parsed = JSON.parse(text);
			if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('not an object');
			send(status, kept);
			return finish(JSON.stringify(isWrite ? writeReply(parsed, readMask) : maskAttributes(parsed, mask)));
		} catch {
			send(500, { ...headersWithout(kept, 'content-type'), 'content-type': 'application/json; charset=utf-8' });
			return finish(JSON.stringify({ error: 'pat_mask_failed' }));
		}
	};
}

function bearerOf(request) {
	const match = /^Bearer\s+(\S+)\s*$/i.exec(String(request.headers?.authorization ?? ''));
	return match ? match[1] : null;
}

/** Overwrite the PAT everywhere the request object exposes it. */
function replaceAuthorization(request, token) {
	request.headers.authorization = `Bearer ${token}`;
	const raw = request.rawHeaders;
	if (!Array.isArray(raw)) return;
	for (let index = 0; index < raw.length - 1; index += 2) {
		if (String(raw[index]).toLowerCase() === 'authorization') raw[index + 1] = `Bearer ${token}`;
	}
}

function answer(response, config, status, code, extraHeaders = {}) {
	response.writeHead(status, {
		...extraHeaders,
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	response.end(JSON.stringify({ error: code }));
	return true;
}

/**
 * pg and memberWorkspaceEntries are injected: the second lives in bridge-api.mjs, which
 * imports this module.
 */
export function createPatGate({ pg, fetchImpl, memberWorkspaceEntries, kv, rateLimit: bucket = DEFAULT_RATE_LIMIT, now = Date.now }) {
	const unavailable = (what) => failure(503, 'pat_unavailable', `${what} is unavailable; try again.`);

	/** Every store call of the gate runs through here: whatever it throws, the caller sees 503. */
	async function guarded(what, work) {
		try {
			return await work();
		} catch (error) {
			if (error?.status === 503) throw error;
			console.warn(`[osionos-bridge] pat ${what} unavailable: ${error?.status ?? 'error'}`);
			throw unavailable(what);
		}
	}

	// An answer that is not a list is a store anomaly, not "no such token".
	const listOnly = {
		asService: () => ({
			get: async (path) => {
				const rows = await pg.asService().get(path);
				if (!Array.isArray(rows)) throw new TypeError('non-list answer');
				return rows;
			},
		}),
	};
	const lookup = (secret) => guarded('token lookup', () => findPatByHash({ pg: listOnly, hash: hashPatSecret(secret) }));

	async function audit(request, config, row, jti, url, outcome) {
		const meta = clientMeta(request, { ipHeader: config.clientIpHeader, hashSecret: config.ipHashSecret });
		const details = { tokenId: row.id, method: request.method, path: url.pathname, outcome };
		await writeAudit(pg, { session: { userId: row.user_id, raw: { jti } }, meta, eventType: 'pat_use', details });
	}

	/** Throws 429 past the client's bucket; a failing store is 503, never a free pass. */
	async function limitClient(request, config) {
		const meta = clientMeta(request, { ipHeader: config.clientIpHeader, hashSecret: config.ipHashSecret });
		try {
			await rateLimit(kv, ['pat', meta.ipHash ?? meta.ipPrefix ?? 'unknown'], bucket);
		} catch (error) {
			if (error?.status === 429) throw Object.assign(failure(429, 'pat_rate_limited', 'Too many requests.'), { retryAfterSeconds: error.retryAfterSeconds });
			throw unavailable('rate limiting');
		}
	}

	/**
	 * A refusal of a token that resolved leaves a row, but one per token and outcome per hour:
	 * a repeated denial is the same fact. A failing audit never turns the refusal into success.
	 */
	async function refuse(ctx, status, code, outcome) {
		const first = await kv.setNx(`patdeny:${ctx.row.id}:${outcome}`, '1', AUDIT_WINDOW_MS).catch(() => true);
		if (first) await audit(ctx.request, ctx.config, ctx.row, ctx.jti, ctx.url, outcome).catch(() => console.warn('[osionos-bridge] pat denial audit unavailable'));
		return answer(ctx.response, ctx.config, status, code);
	}

	const stampOf = () => new Date(now()).toISOString();

	/** One conditional PATCH decides atomically which request of the hour records the use. */
	async function claimHourlyUse(rowId) {
		const stamp = stampOf();
		const cutoff = new Date(now() - AUDIT_WINDOW_MS).toISOString();
		const claimed = await guarded('token use', () => pg.asService().patch(`${PAT_TABLE}?id=eq.${rowId}&or=(last_used_at.is.null,last_used_at.lt.${cutoff})&select=id`, { last_used_at: stamp }, { prefer: 'return=representation' }));
		return Array.isArray(claimed) && claimed.length > 0 ? stamp : null;
	}

	/** The claim is given back when its audit row fails, so the next request records the hour. */
	async function releaseClaim(rowId, stamp) {
		await pg.asService().patch(`${PAT_TABLE}?id=eq.${rowId}&last_used_at=eq.${stamp}`, { last_used_at: null }, { prefer: 'return=minimal' }).catch(() => console.warn('[osionos-bridge] pat claim release unavailable'));
	}

	async function recordHourlyUse(ctx) {
		const stamp = await claimHourlyUse(ctx.row.id);
		if (!stamp) return;
		try {
			await audit(ctx.request, ctx.config, ctx.row, ctx.jti, ctx.url, 'allowed');
		} catch {
			await releaseClaim(ctx.row.id, stamp);
			throw unavailable('token audit');
		}
	}

	/**
	 * The workspaces the session may carry. Divergence from D-P5-1: the home is the owner's
	 * oldest owned workspace, not osionos_bridge_identities.private_workspace_id (which the
	 * bridge does not read at this layer); a row that is not the user's own is a store fault.
	 */
	async function workspacesOf(userId, config) {
		const owned = await guarded('workspace lookup', () => pg.asService().get(`osionos_workspaces?owner_id=eq.${userId}&select=id,owner_id&order=created_at.asc&limit=${OWNED_WORKSPACE_LIMIT}`));
		const rows = Array.isArray(owned) ? owned : [];
		if (rows.some((entry) => String(entry.owner_id).toLowerCase() !== String(userId).toLowerCase())) throw unavailable('workspace lookup');
		const ids = rows.map((entry) => String(entry.id));
		if (ids.length === 0) return null;
		const members = await guarded('member lookup', () => memberWorkspaceEntries(userId, ids, config, fetchImpl, { strict: true }));
		return { home: ids[0], extras: [...ids.slice(1).map((id) => ({ _id: id, role: 'owner' })), ...members] };
	}

	/** Returns true when it answered the request, false when the route may run. */
	return async function patGate(request, response, url, config) {
		const presented = bearerOf(request);
		if (presented === null || !presented.startsWith(PAT_LIKE_PREFIX)) return false;
		try {
			await limitClient(request, config);
		} catch (error) {
			if (error.status !== 429) throw error;
			return answer(response, config, 429, error.code, { 'retry-after': String(error.retryAfterSeconds) });
		}
		if (!presented.startsWith(PAT_PREFIX) || !isPatSecret(presented)) return answer(response, config, 401, 'pat_invalid');
		const row = await lookup(presented);
		if (!row) return answer(response, config, 401, 'pat_invalid');
		const ctx = { request, response, url, config, row, jti: randomUUID() };
		if (row.revoked_at != null) {
			await refuse(ctx, 401, 'pat_invalid', 'revoked');
			return true;
		}
		if (!(Date.parse(row.expires_at) > now())) {
			await refuse(ctx, 401, 'pat_invalid', 'expired');
			return true;
		}
		const route = PAT_ROUTES.find((candidate) => candidate.method === request.method && candidate.path.test(url.pathname));
		if (!route) return refuse(ctx, 403, 'pat_route_not_allowed', 'route_not_allowed');
		const decision = evaluatePat(row, { resource: route.resource, permission: route.permission });
		if (!decision.allowed) return refuse(ctx, 403, 'pat_scope_denied', 'scope_denied');
		const workspaces = await workspacesOf(row.user_id, config);
		if (!workspaces) return refuse(ctx, 403, 'pat_no_workspace', 'no_workspace');
		await recordHourlyUse(ctx);
		const session = signAppSessionToken({
			payload: { subject: row.user_id, provider: 'pat' },
			workspace: { _id: workspaces.home },
			config: { ...config, sessionTtlSeconds: PAT_SESSION_TTL_SECONDS },
			memberWorkspaces: workspaces.extras,
			jti: ctx.jti,
			now: now(),
		});
		replaceAuthorization(request, session.token);
		if (route.permission === 'read') installResponseMask(response, decision.mask);
		else {
			const readDecision = evaluatePat(row, { resource: route.resource, permission: 'read' });
			installResponseMask(response, decision.mask, { readMask: readDecision.allowed ? readDecision.mask : [], isWrite: true });
			request.patWriteMask = decision.mask;
		}
		return false;
	};
}
