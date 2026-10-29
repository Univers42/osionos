/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-tokens.mjs                           +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The management routes of the personal access tokens: GET /api/account/tokens,
 * POST /api/account/tokens, DELETE /api/account/tokens/:id and DELETE /api/account/tokens
 * (every live token of the caller).
 *
 * A PAT MAY NEVER REACH THESE ROUTES. A token that could mint a token would turn a
 * read-only credential into a write one, so the middleware of P5-1-d refuses a PAT on these
 * paths with 403 pat_route_not_allowed before the route runs. The route itself asks for an
 * app session, so a PAT bearer is a 401 here even without that middleware.
 *
 * The secret is shown ONCE: it is in the create answer and nowhere else, not in the list,
 * not in an audit row, not in a log line and not in an error body. The list answers the
 * eight keys of an entry and never the hash; the account role could not read the hash even
 * if the route asked for it (P5-1-a's column grant).
 *
 * The vocabulary is the one of scripts/bridge-pat-permissions.mjs, imported and never
 * copied: the list serves it as its catalog, so the panel renders what the bridge accepts
 * instead of holding a second list that can drift.
 *
 * Creating a token and revoking every token need a sudo window (requireSudo): the window
 * lives ten minutes under the session's own jti (bridge-guard.mjs:185-199), so it is not
 * single-use and it is opened by the sign-in flow, not by this route.
 *
 * Caveat: the expiry cap is measured against the bridge's clock, so a client whose clock is
 * behind is refused a token it could have had: the shorter life is the safe answer.
 * Caveat: the last used stamp is written by the middleware (P5-1-d) at most once an hour,
 * so the column is accurate to the hour, not to the second.
 */

import { randomUUID } from 'node:crypto';
import { clientMeta, rateLimit, requireSudo, writeAudit } from './bridge-guard.mjs';
import { PAT_PERMISSIONS, PAT_RESOURCES, isPatScope } from './bridge-pat-permissions.mjs';
import { PAT_LIVE_LIMIT, countLivePats, createPat, listPats, mintPatSecret, revokeAllPats, revokePat } from './bridge-pat-store.mjs';
import { bearerToken, readJsonBody, requireUuid, sendJson } from './bridge-social-core.mjs';

const TOKENS_PATH = '/api/account/tokens';
const KINDS = new Set(['classic', 'fine_grained']);
const BODY_KEYS = new Set(['name', 'kind', 'expiresAt', 'scopes', 'grants']);
const GRANT_KEYS = new Set(['resource', 'attributes', 'permissions']);
const MAX_NAME_LENGTH = 64;
const MAX_EXPIRY_DAYS = 365;
const EXPIRY_CAP_MS = MAX_EXPIRY_DAYS * 86_400_000;
const CREATE_LIMIT = 10;
const REVOKE_LIMIT = 30;
const WINDOW_MS = 60_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function patError(status, code, message) {
	return Object.assign(new Error(message), { status, code });
}

function isPlainObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A caller value in an error message: no control character, no long tail. */
function label(value) {
	return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 64);
}

function nameOf(value) {
	const name = typeof value === 'string' ? value.trim() : '';
	if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
		throw patError(422, 'pat_invalid_body', `The name must be 1 to ${MAX_NAME_LENGTH} characters.`);
	}
	return name;
}

function kindOf(value) {
	if (typeof value !== 'string' || !KINDS.has(value)) {
		throw patError(422, 'pat_invalid_body', 'The kind must be classic or fine_grained.');
	}
	return value;
}

/** The expiry, normalized: required, a real date, in the future and within the cap. */
function expiryOf(value) {
	if (typeof value !== 'string' || value.trim() === '') {
		throw patError(422, 'pat_expiry_required', 'An expiry date is required.');
	}
	const text = value.trim();
	const parsed = Date.parse(text);
	if (!ISO_DATE.test(text) || !Number.isFinite(parsed)) {
		throw patError(422, 'pat_invalid_body', 'The expiry date must be an ISO date.');
	}
	const now = Date.now();
	if (parsed <= now) throw patError(422, 'pat_expiry_required', 'The expiry date must be in the future.');
	if (parsed > now + EXPIRY_CAP_MS) {
		throw patError(422, 'pat_expiry_required', `The expiry date must be within ${MAX_EXPIRY_DAYS} days.`);
	}
	return new Date(parsed).toISOString();
}

function scopesOf(value) {
	if (!Array.isArray(value) || value.length === 0) {
		throw patError(422, 'pat_invalid_body', 'A classic token needs at least one scope.');
	}
	for (const scope of value) {
		if (!isPatScope(scope)) throw patError(422, 'pat_unknown_scope', `Unknown scope: ${label(scope)}.`);
	}
	return [...value];
}

function grantsOf(value) {
	if (!Array.isArray(value) || value.length === 0) {
		throw patError(422, 'pat_invalid_body', 'A fine-grained token needs at least one grant.');
	}
	const grants = [];
	for (const grant of value) {
		if (!isPlainObject(grant)) throw patError(422, 'pat_invalid_body', 'A grant must be an object.');
		for (const key of Object.keys(grant)) {
			if (!GRANT_KEYS.has(key)) throw patError(422, 'pat_invalid_body', `Unknown field in a grant: ${label(key)}.`);
		}
		const resource = grant.resource;
		if (typeof resource !== 'string' || !Object.hasOwn(PAT_RESOURCES, resource)) {
			throw patError(422, 'pat_unknown_resource', `Unknown resource: ${label(resource)}.`);
		}
		if (!Array.isArray(grant.attributes) || grant.attributes.length === 0) {
			throw patError(422, 'pat_invalid_body', 'A grant needs at least one attribute.');
		}
		const attributes = grant.attributes.map((attribute) => {
			if (typeof attribute !== 'string' || !PAT_RESOURCES[resource].attributes.includes(attribute)) {
				throw patError(422, 'pat_unknown_attribute', `Unknown attribute: ${label(attribute)}.`);
			}
			return attribute;
		});
		if (!Array.isArray(grant.permissions) || grant.permissions.length === 0) {
			throw patError(422, 'pat_invalid_body', 'A grant needs at least one permission.');
		}
		const permissions = grant.permissions.map((permission) => {
			if (typeof permission !== 'string' || !PAT_PERMISSIONS.includes(permission)) {
				throw patError(422, 'pat_unknown_permission', `Unknown permission: ${label(permission)}.`);
			}
			return permission;
		});
		grants.push({ resource, attributes, permissions });
	}
	return grants;
}

/** The body of a create, read against the vocabulary: the shape a classic and a fine-grained token have. */
function parseBody(body) {
	if (!isPlainObject(body)) throw patError(422, 'pat_invalid_body', 'The request body must be an object.');
	for (const key of Object.keys(body)) {
		if (!BODY_KEYS.has(key)) throw patError(422, 'pat_invalid_body', `Unknown field: ${label(key)}.`);
	}
	const kind = kindOf(body.kind);
	const name = nameOf(body.name);
	const expiresAt = expiryOf(body.expiresAt);
	if (kind === 'classic') {
		if (body.grants !== undefined) throw patError(422, 'pat_invalid_body', 'A classic token carries scopes, not grants.');
		return { kind, name, expiresAt, scopes: scopesOf(body.scopes), grants: [] };
	}
	if (body.scopes !== undefined) throw patError(422, 'pat_invalid_body', 'A fine-grained token carries grants, not scopes.');
	return { kind, name, expiresAt, scopes: [], grants: grantsOf(body.grants) };
}

/** The client metadata of the request, with the IP columns blank when no header is configured. */
function requestMeta(request, config) {
	const meta = clientMeta(request, { ipHeader: config.clientIpHeader, hashSecret: config.ipHashSecret });
	if (!config.clientIpHeader) {
		meta.ipPrefix = null;
		meta.ipHash = null;
	}
	return meta;
}

/** One entry of the list: the nine keys of the contract, and nothing else. */
function tokenEntry(row) {
	return {
		id: row.id,
		name: row.name,
		kind: row.kind,
		scopes: Array.isArray(row.scopes) ? row.scopes : [],
		grants: Array.isArray(row.grants) ? row.grants : [],
		createdAt: row.created_at ?? null,
		expiresAt: row.expires_at ?? null,
		revokedAt: row.revoked_at ?? null,
		lastUsedAt: row.last_used_at ?? null,
	};
}

/** The vocabulary the panel picks from: the bridge module's own constants, served as they are. */
function catalogOf() {
	return { resources: PAT_RESOURCES, permissions: PAT_PERMISSIONS };
}

/** The throttle: the window is told to the caller in the body and in the header. */
async function throttle(kv, parts, limit, response, config) {
	try {
		await rateLimit(kv, parts, { limit, windowMs: WINDOW_MS });
	} catch (error) {
		if (error?.status !== 429) throw error;
		const retryAfterSeconds = Number.isFinite(error?.retryAfterSeconds) ? error.retryAfterSeconds : Math.ceil(WINDOW_MS / 1_000);
		response.setHeader('retry-after', String(retryAfterSeconds));
		sendJson(response, 429, { ok: false, message: 'Too many requests.', code: 'rate_limited', retryAfterSeconds }, config);
		return true;
	}
	return false;
}

async function readBody(request) {
	try {
		return await readJsonBody(request);
	} catch (error) {
		if (error?.status === 400) throw patError(422, 'pat_invalid_body', 'The request body must be a JSON object.');
		throw error;
	}
}

/** The uuid of the token the path names, or the 422 a hostile path deserves. */
function tokenIdFrom(pathname) {
	try {
		return requireUuid(decodeURIComponent(pathname.slice(`${TOKENS_PATH}/`.length)), 'tokenId');
	} catch {
		throw patError(422, 'pat_invalid_token_id', 'The token id must be a UUID.');
	}
}

function noContent(response, config) {
	response.writeHead(204, {
		'cache-control': 'no-store',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	response.end();
	return true;
}

async function listTokens({ config, pg, session }, response) {
	const rows = await listPats({ pg, session });
	return sendJson(response, 200, { ok: true, tokens: rows.map(tokenEntry), catalog: catalogOf() }, config);
}

async function createToken({ config, pg, kv, session, request }, response) {
	if (await throttle(kv, ['pat-create', session.userId], CREATE_LIMIT, response, config)) return true;
	await requireSudo(kv, session);
	const { kind, name, scopes, grants, expiresAt } = parseBody(await readBody(request));
	if (await countLivePats({ pg, userId: session.userId }) >= PAT_LIVE_LIMIT) {
		throw patError(422, 'pat_limit_reached', `You have ${PAT_LIVE_LIMIT} active tokens. Revoke one before creating another.`);
	}
	const { secret, hash } = mintPatSecret();
	// The id is minted here because the audit row that names it is written before the row.
	const tokenId = randomUUID();
	await writeAudit(pg, { session, meta: requestMeta(request, config), eventType: 'pat_create', details: { tokenId, kind, expiresAt } });
	const row = await createPat({ pg, userId: session.userId, name, kind, scopes, grants, expiresAt, id: tokenId, hash });
	return sendJson(response, 201, { ok: true, token: tokenEntry(row), secret }, config);
}

async function revokeOneToken({ config, pg, kv, session, request }, id, response) {
	if (await throttle(kv, ['pat-revoke', session.userId], REVOKE_LIMIT, response, config)) return true;
	await writeAudit(pg, { session, meta: requestMeta(request, config), eventType: 'pat_revoke', details: { tokenId: id } });
	const revoked = await revokePat({ pg, userId: session.userId, id, now: new Date().toISOString() });
	if (!revoked) throw patError(404, 'pat_not_found', 'Token not found.');
	return noContent(response, config);
}

async function revokeEveryToken({ config, pg, kv, session, request }, response) {
	if (await throttle(kv, ['pat-revoke-all', session.userId], REVOKE_LIMIT, response, config)) return true;
	await requireSudo(kv, session);
	await writeAudit(pg, { session, meta: requestMeta(request, config), eventType: 'pat_revoke_all', details: { scope: 'all' } });
	await revokeAllPats({ pg, userId: session.userId, now: new Date().toISOString() });
	return noContent(response, config);
}

/**
 * The account routes of this module. Every one of them asks for an app session first: a
 * personal access token is refused here (403 pat_route_not_allowed, by the middleware of
 * P5-1-d) because a token that could mint a token would widen a credential.
 */
export function createPatRoutes({ config, pg, kv, verifySession }) {
	return async function handleAccountTokens(url, request, response) {
		const pathname = url.pathname;
		if (pathname !== TOKENS_PATH && !pathname.startsWith(`${TOKENS_PATH}/`)) return false;
		const session = verifySession(bearerToken(request), config);
		if (request.method === 'GET' && pathname === TOKENS_PATH) return listTokens({ config, pg, session }, response);
		if (request.method === 'POST' && pathname === TOKENS_PATH) return createToken({ config, pg, kv, session, request }, response);
		if (request.method === 'DELETE' && pathname === TOKENS_PATH) return revokeEveryToken({ config, pg, kv, session, request }, response);
		if (request.method === 'DELETE') return revokeOneToken({ config, pg, kv, session, request }, tokenIdFrom(pathname), response);
		return false;
	};
}
