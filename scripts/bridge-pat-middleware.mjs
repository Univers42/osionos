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
 * Caveat: the hourly claim of `last_used_at` is stamped before the audit row is written, so a
 * failed audit write loses that hour's row (the request itself is refused 503, not served).
 * Caveat: the gate sees only the Authorization header; a PAT sent in the query string or a
 * cookie is not a PAT here, and is refused by the routes as any malformed session.
 */

import { randomUUID } from 'node:crypto';
import { clientMeta, writeAudit } from './bridge-guard.mjs';
import { attributesOutsideMask, evaluatePat, maskAttributes } from './bridge-pat-permissions.mjs';
import { findPatByHash, hashPatSecret, isPatSecret, PAT_PREFIX } from './bridge-pat-store.mjs';
import { signAppSessionToken } from './bridge-session-token.mjs';

const PAT_TABLE = 'osionos_personal_access_tokens';
const PAT_SESSION_TTL_SECONDS = 120;
const AUDIT_WINDOW_MS = 3_600_000;
const PAGE_PATH = /^\/api\/pages\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
	const outside = attributesOutsideMask(payload, mask).filter((key) => !CONTROL_FIELDS.has(key));
	if (outside.length > 0) throw failure(403, 'pat_forbidden_attribute', `This token may not change: ${outside.join(', ')}.`);
	return payload;
}

function headersWithout(headers, name) {
	return Object.fromEntries(Object.entries(headers ?? {}).filter(([key]) => key.toLowerCase() !== name));
}

/**
 * A route error may carry page attributes in `details` (the 409 version_conflict returns the
 * stored content). They are held to the token's READ mask; `version` rides with `content`.
 * Caveat: only a JSON object body with an object `details` is filtered; any other error body
 * passes through, which is safe only while routes put no page data outside `details`.
 */
function maskErrorDetails(text, readMask) {
	try {
		const parsed = JSON.parse(text);
		if (parsed === null || typeof parsed !== 'object' || !parsed.details || typeof parsed.details !== 'object') return text;
		const allowed = Array.isArray(readMask) ? [...readMask] : [];
		if (allowed.includes('content')) allowed.push('version');
		return JSON.stringify({ ...parsed, details: maskAttributes(parsed.details, allowed) });
	} catch {
		return text;
	}
}

/**
 * Hold a route's response back, mask it, then send it. Only the route's own head and body are
 * captured. A 2xx body is masked unless maskSuccess is off (the write route's reply holds no
 * page attributes); a non-2xx body has its `details` held to the read mask.
 */
export function installResponseMask(response, mask, { readMask = mask, maskSuccess = true } = {}) {
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
			return finish(maskErrorDetails(text, readMask));
		}
		if (!maskSuccess) {
			send(status, headers);
			return finish(text);
		}
		try {
			const parsed = JSON.parse(text);
			if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('not an object');
			send(status, kept);
			return finish(JSON.stringify(maskAttributes(parsed, mask)));
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

function answer(response, config, status, code) {
	response.writeHead(status, {
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
export function createPatGate({ pg, fetchImpl, memberWorkspaceEntries, now = Date.now }) {
	async function lookup(secret) {
		try {
			return await findPatByHash({ pg, hash: hashPatSecret(secret) });
		} catch (error) {
			console.warn(`[osionos-bridge] pat lookup unavailable: ${error?.status ?? 'error'}`);
			throw failure(503, 'pat_unavailable', 'Token lookup is unavailable; try again.');
		}
	}

	async function audit(request, config, row, jti, url, outcome) {
		const meta = clientMeta(request, { ipHeader: config.clientIpHeader, hashSecret: config.ipHashSecret });
		const details = { tokenId: row.id, method: request.method, path: url.pathname, outcome };
		await writeAudit(pg, { session: { userId: row.user_id, raw: { jti } }, meta, eventType: 'pat_use', details });
	}

	/** A refusal of a token that resolved leaves its own row; a failing audit never turns it into success. */
	async function refuse(ctx, status, code, outcome) {
		await audit(ctx.request, ctx.config, ctx.row, ctx.jti, ctx.url, outcome).catch(() => console.warn('[osionos-bridge] pat denial audit unavailable'));
		return answer(ctx.response, ctx.config, status, code);
	}

	/** True for the one request of an hour that records a use; the conditional PATCH decides atomically. */
	async function claimHourlyUse(rowId) {
		const stamp = new Date(now()).toISOString();
		const cutoff = new Date(now() - AUDIT_WINDOW_MS).toISOString();
		for (const filter of ['is.null', `lt.${cutoff}`]) {
			const claimed = await pg.asService().patch(`${PAT_TABLE}?id=eq.${rowId}&last_used_at=${filter}&select=id`, { last_used_at: stamp }, { prefer: 'return=representation' });
			if (Array.isArray(claimed) && claimed.length > 0) return true;
		}
		return false;
	}

	async function workspacesOf(userId, config) {
		const owned = await pg.asService().get(`osionos_workspaces?owner_id=eq.${userId}&select=id&order=created_at.asc&limit=100`);
		const ids = (Array.isArray(owned) ? owned : []).map((entry) => String(entry.id));
		if (ids.length === 0) return null;
		const members = await memberWorkspaceEntries(userId, ids, config, fetchImpl);
		return { home: ids[0], extras: [...ids.slice(1).map((id) => ({ _id: id, role: 'owner' })), ...members] };
	}

	/** Returns true when it answered the request, false when the route may run. */
	return async function patGate(request, response, url, config) {
		const presented = bearerOf(request);
		if (presented === null || !presented.startsWith(PAT_PREFIX)) return false;
		if (!isPatSecret(presented)) return answer(response, config, 401, 'pat_invalid');
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
		if (await claimHourlyUse(row.id)) await audit(request, config, row, ctx.jti, url, 'allowed');
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
			installResponseMask(response, decision.mask, { readMask: readDecision.allowed ? readDecision.mask : [], maskSuccess: false });
			request.patWriteMask = decision.mask;
		}
		return false;
	};
}
