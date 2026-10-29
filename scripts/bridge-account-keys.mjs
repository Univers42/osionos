/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-keys.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The public SSH and GPG keys of the caller: GET /api/account/keys, POST /api/account/keys
 * and DELETE /api/account/keys/:id.
 *
 * Only public keys live here. The validator (bridge-key-parse.mjs) refuses private material
 * and rebuilds the stored text, so the row never holds a comment, an option or a second line;
 * the fingerprint is computed server-side and a body that names one is refused.
 *
 * Add and delete need a sudo window. An add is throttled to ten an hour, and the audit row
 * (kind and fingerprint, never the key text) is written before the insert. The 50-row cap is
 * the database trigger's, mapped to 409 key_limit: a count here would be a race. A delete is
 * ONE statement scoped by id AND user_id, so another user's id is the same 404 as a random one.
 *
 * Every route asks for an app session: a personal access token is a 401 here, so a read-only
 * credential cannot add a key that would later sign as the user.
 *
 * Caveat: the add throttle is a fixed window counted in the key/value store, so a caller can
 * get twenty adds across a window boundary; the sudo window and the 50-row cap bound the harm.
 */

import { randomUUID } from 'node:crypto';
import { clientMeta, rateLimit, requireSudo, writeAudit } from './bridge-guard.mjs';
import { pgError } from './bridge-pg.mjs';
import { parsePublicKey } from './bridge-key-parse.mjs';
import { bearerToken, readJsonBody, requireUuid, sendJson } from './bridge-social-core.mjs';

const KEYS_PATH = '/api/account/keys';
const TABLE = 'osionos_user_keys';
const BODY_KEYS = new Set(['kind', 'title', 'publicKey']);
const KINDS = new Set(['ssh', 'gpg']);
const LIST_COLUMNS = 'id,kind,title,public_key,fingerprint,key_type,created_at';
const LIST_LIMIT = 50;
const MAX_TITLE_LENGTH = 80;
const ADD_LIMIT = 10;
const ADD_WINDOW_MS = 3_600_000;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f\u0085\u2028\u2029]/;

function keyRouteError(status, code, message) {
	return Object.assign(new Error(message), { status, code });
}

const invalidBody = (message) => keyRouteError(422, 'invalid_key_body', message);

function isPlainObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A missing table is an outage, never an empty answer. */
function unavailable(error) {
	return Number(error?.upstreamStatus) === 404 ? pgError(503, 'account_plane_unavailable') : error;
}

/** The database's two refusals on insert, as the answers a person can act on. */
function insertFailure(error) {
	if (Number(error?.upstreamStatus) === 409) return keyRouteError(409, 'key_exists', 'This key is already saved.');
	if (String(error?.upstreamText ?? '').includes('key_limit')) {
		return keyRouteError(409, 'key_limit', 'You have reached the limit of 50 keys. Delete one before adding another.');
	}
	return unavailable(error);
}

function requestMeta(request, config) {
	const meta = clientMeta(request, { ipHeader: config.clientIpHeader, hashSecret: config.ipHashSecret });
	if (!config.clientIpHeader) {
		meta.ipPrefix = null;
		meta.ipHash = null;
	}
	return meta;
}

function titleOf(value) {
	const title = typeof value === 'string' ? value.trim() : '';
	if (title.length < 1 || title.length > MAX_TITLE_LENGTH || CONTROL_CHARACTERS.test(title)) {
		throw invalidBody(`The title must be 1 to ${MAX_TITLE_LENGTH} characters on one line.`);
	}
	return title;
}

/** Exactly {kind, title, publicKey}: the fingerprint and the owner are never the caller's to say. */
function parseBody(body) {
	if (!isPlainObject(body)) throw invalidBody('The request body must be an object.');
	for (const key of Object.keys(body)) {
		if (!BODY_KEYS.has(key)) throw invalidBody('The request body has a field this route does not accept.');
	}
	if (typeof body.kind !== 'string' || !KINDS.has(body.kind)) throw invalidBody('The kind must be ssh or gpg.');
	if (typeof body.publicKey !== 'string' || body.publicKey === '') throw invalidBody('The public key is required.');
	return { kind: body.kind, title: titleOf(body.title), publicKey: body.publicKey };
}

async function readBody(request) {
	try {
		return await readJsonBody(request);
	} catch (error) {
		if (error?.status === 400) throw invalidBody('The request body must be a JSON object.');
		throw error;
	}
}

/** The throttle: true when it answered 429 itself. */
async function throttled(kv, session, response, config) {
	try {
		await rateLimit(kv, ['key-add', session.userId], { limit: ADD_LIMIT, windowMs: ADD_WINDOW_MS });
	} catch (error) {
		if (error?.status !== 429) throw error;
		const retryAfterSeconds = Number.isFinite(error.retryAfterSeconds) ? error.retryAfterSeconds : ADD_WINDOW_MS / 1_000;
		response.setHeader('retry-after', String(retryAfterSeconds));
		sendJson(response, 429, { ok: false, message: 'Too many requests.', code: 'rate_limited', retryAfterSeconds }, config);
		return true;
	}
	return false;
}

/** What the person sees of a key; the owner id stays in the table. */
function keyEntry(row, { withKey }) {
	const entry = { id: row.id, kind: row.kind, title: row.title, fingerprint: row.fingerprint, keyType: row.key_type ?? null, createdAt: row.created_at ?? null };
	return withKey ? { ...entry, publicKey: row.public_key } : entry;
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

async function listKeys({ config, pg, session }, response) {
	const params = new URLSearchParams({ select: LIST_COLUMNS, order: 'created_at.desc', limit: String(LIST_LIMIT) });
	let rows;
	try {
		// The owner policy is the scope: no user filter here that a mistake could widen.
		rows = await pg.asUser(session).get(`${TABLE}?${params}`);
	} catch (error) {
		throw unavailable(error);
	}
	const keys = (Array.isArray(rows) ? rows : []).map((row) => keyEntry(row, { withKey: true }));
	return sendJson(response, 200, { ok: true, keys }, config);
}

async function addKey({ config, pg, kv, session, request }, response) {
	if (await throttled(kv, session, response, config)) return true;
	await requireSudo(kv, session);
	const { kind, title, publicKey } = parseBody(await readBody(request));
	const parsed = parsePublicKey(kind, publicKey);
	await writeAudit(pg, { session, meta: requestMeta(request, config), eventType: 'account.key.add', details: { kind, fingerprint: parsed.fingerprint } });
	const row = { id: randomUUID(), user_id: session.userId, kind, title, public_key: parsed.publicKey, fingerprint: parsed.fingerprint, key_type: parsed.keyType };
	let stored;
	try {
		stored = await pg.asService().post(TABLE, row, { prefer: 'return=representation' });
	} catch (error) {
		throw insertFailure(error);
	}
	const created = Array.isArray(stored) && stored[0] ? stored[0] : row;
	return sendJson(response, 201, { ok: true, key: keyEntry(created, { withKey: false }) }, config);
}

async function deleteKey({ config, pg, kv, session, request }, pathname, response) {
	await requireSudo(kv, session);
	let id;
	try {
		id = requireUuid(decodeURIComponent(pathname.slice(`${KEYS_PATH}/`.length)), 'keyId');
	} catch {
		throw invalidBody('The key id must be a UUID.');
	}
	await writeAudit(pg, { session, meta: requestMeta(request, config), eventType: 'account.key.delete', details: { keyId: id } });
	const params = new URLSearchParams({ id: `eq.${id}`, user_id: `eq.${session.userId}` });
	let removed;
	try {
		removed = await pg.asService().del(`${TABLE}?${params}`, { prefer: 'return=representation' });
	} catch (error) {
		throw unavailable(error);
	}
	if (!Array.isArray(removed) || removed.length === 0) throw keyRouteError(404, 'key_not_found', 'Key not found.');
	return noContent(response, config);
}

/** The key routes; each one asks for an app session first, so a PAT bearer is a 401. */
export function createAccountKeysRoutes({ config, pg, kv, verifySession }) {
	return async function handleAccountKeys(url, request, response) {
		const pathname = url.pathname;
		if (pathname !== KEYS_PATH && !pathname.startsWith(`${KEYS_PATH}/`)) return false;
		const known = (request.method === 'DELETE' && pathname !== KEYS_PATH) || (pathname === KEYS_PATH && (request.method === 'GET' || request.method === 'POST'));
		if (!known) return false;
		const session = verifySession(bearerToken(request), config);
		const context = { config, pg, kv, session, request };
		if (request.method === 'GET') return listKeys(context, response);
		if (request.method === 'POST') return addKey(context, response);
		return deleteKey(context, pathname, response);
	};
}
