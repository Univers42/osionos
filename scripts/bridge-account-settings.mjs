/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-settings.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * GET and PATCH /api/account/settings: the account summary of the CALLER.
 *
 * The user id is the session's own and the only reads and writes go through
 * `pg.asUser(session)`, so row-level security (`user_id = osionos_account_uid()`) is the
 * isolation; no query, header or body can name another user. The one stored field is
 * `preferredMfaMethod` in the `security` section of osionos_user_settings; it orders two
 * buttons in a modal and no decision reads it, so the PATCH needs no sudo.
 *
 * Fields the bridge cannot prove are absent, never defaulted: `hasPassword` (GoTrue's
 * admin payload has no password hash and an email identity exists without a password),
 * `passwordUpdatedAt`, `pendingDeletionAt` (served by GET /api/account/deletion).
 *
 * Caveat: one code, `settings_read_failed`, covers a failed read, a failed write and a
 * down key/value store (the message says which); it never ends in `_unavailable` or
 * `_off`, because the client reads those as "route not served" and would hide an outage.
 * A duplicate key in the raw JSON body collapses in JSON.parse (last wins) and cannot be
 * detected afterwards; the surviving value is still validated.
 */

import { accountError, callerSession, readBody, respondWithError } from './bridge-account-sudo.mjs';
import { rateLimit } from './bridge-guard.mjs';
import { sendJson } from './bridge-social-core.mjs';

const PATH = /^\/api\/account\/settings(?:\/.*)?$/;
const ROUTE = '/api/account/settings';
const METHODS = ['totp', 'recovery'];
const LIMIT = { limit: 120, windowMs: 60_000 };
const KEY_SHAPE = /^[A-Za-z0-9_]{1,40}$/;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A store, GoTrue or kv failure as the one outage answer; `what` says which. */
export const settingsFailure = (what) => accountError(503, 'settings_read_failed', `Could not ${what}; try again shortly.`);

/** The rate limit, failing closed: a down kv is an outage answer, a 429 passes through. */
export async function limitOrFail(kv, parts, options) {
	try {
		await rateLimit(kv, parts, options);
	} catch (error) {
		if (error?.status === 429) throw error;
		throw settingsFailure('check the request rate');
	}
}

async function readSecurityRow(pg, session) {
	const params = new URLSearchParams({ section: 'eq.security', select: 'value,updated_at', limit: '1' });
	try {
		const rows = await pg.asUser(session).get(`osionos_user_settings?${params}`);
		return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
	} catch {
		console.error('account_settings_source_failed');
		throw settingsFailure('read the account settings');
	}
}

function summary(session, env, row) {
	const security = { passkeysEnabled: env.PASSKEYS_ENABLED === '1' };
	const method = row?.value?.preferredMfaMethod;
	if (METHODS.includes(method)) security.preferredMfaMethod = method;
	const body = { userId: session.userId, security };
	if (typeof row?.updated_at === 'string') body.updatedAt = row.updated_at;
	return body;
}

const keyLabel = (key) => (KEY_SHAPE.test(key) ? `"${key}"` : 'a key');

function invalidBody(message) {
	return accountError(422, 'invalid_body', message);
}

/** The method a PATCH body asks for; anything beyond `{ security: { preferredMfaMethod } }` is refused. */
function requestedMethod(body) {
	if (!isPlainObject(body)) throw invalidBody('The settings body must be a JSON object.');
	const top = Object.keys(body);
	if (top.length === 0) throw accountError(422, 'empty_patch', 'There is nothing to change.');
	const extra = top.find((key) => key !== 'security');
	if (extra !== undefined) throw invalidBody(`The setting ${keyLabel(extra)} cannot be changed here.`);
	if (!isPlainObject(body.security)) throw invalidBody('"security" must be an object.');
	const inner = Object.keys(body.security);
	if (inner.length === 0) throw accountError(422, 'empty_patch', 'There is nothing to change.');
	const other = inner.find((key) => key !== 'preferredMfaMethod');
	if (other !== undefined) throw invalidBody(`The setting ${keyLabel(other)} cannot be changed here.`);
	const method = body.security.preferredMfaMethod;
	if (!METHODS.includes(method)) throw invalidBody('"preferredMfaMethod" must be "totp" or "recovery".');
	return method;
}

async function writeMethod(pg, session, preferredMfaMethod) {
	try {
		await pg.asUser(session).rpc('osionos_user_settings_merge', { p_section: 'security', p_patch: { preferredMfaMethod } });
	} catch {
		throw settingsFailure('save the account settings');
	}
}

export function createAccountSettingsRoutes({ config, pg, kv, verifySession, env = process.env }) {
	return async function handleSettingsRequest(url, request, response) {
		if (!PATH.test(url.pathname)) return false;
		try {
			const session = callerSession(request, config, verifySession);
			if (url.pathname !== ROUTE) throw accountError(404, 'not_found', 'There is no account setting on that path.');
			const method = (request.method || 'GET').toUpperCase();
			if (method !== 'GET' && method !== 'PATCH') throw accountError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);
			await limitOrFail(kv, ['account-settings', session.userId], LIMIT);
			if (method === 'PATCH') await writeMethod(pg, session, requestedMethod(await readBody(request)));
			sendJson(response, 200, summary(session, env, await readSecurityRow(pg, session)), config);
		} catch (error) {
			respondWithError(response, error, config);
		}
		return true;
	};
}
