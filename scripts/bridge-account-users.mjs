/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-users.mjs                            +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**

/**
 * The users administration API: GET /api/account/admin/users (a keyset list),
 * GET and PATCH /api/account/admin/users/:userId, PUT /api/account/admin/users/:userId/roles.
 *
 * Who may call: a session whose platform role, RE-READ from `public.user_roles` and
 * `public.roles` on every request, is admin. The role claim in the token is a hint for the
 * client and never grants here, so a revoked admin loses the console on the next request.
 * Every other caller gets 403 admin_required before a profile row is read.
 *
 * What an admin sees of another user: the public profile fields and the platform role names.
 * The select is an allowlist: an email, a setting, a session or a deletion state is not in it,
 * and the answer is built from the allowlist, not from whatever the row carries.
 *
 * Every call goes through the service role: the account role's row-level security lets a user
 * see only their own rows, so no per-user token can read another profile.
 *
 * Every write records an audit row first. No audit row, no action (bridge-guard.mjs writeAudit).
 *
 * Caveat: sudo is not required. requireSudo has no caller yet (the grant belongs to P1-2b), so
 * demanding it would make the action unreachable; the role gate and the audit row are the gate
 * until it lands.
 * Caveat: two admins revoking each other's admin role at once can still leave no admin; only a
 * self-revoke is refused. A platform with no admin recovers through OSIONOS_ADMIN_EMAILS.
 * Caveat: the audit row records an attempt, so a write that fails after it leaves a row for an
 * action that did not happen.
 */

import { clientMeta, rateLimit, writeAudit } from './bridge-guard.mjs';
import { decodeCursor, keyset, pageOf } from './bridge-paging.mjs';
import { pgError } from './bridge-pg.mjs';
import { isPlatformRole, readPlatformRole, roleAtLeast } from './bridge-roles.mjs';
import { UUID_REGEX, bearerToken, readJsonBody, sendJson } from './bridge-social-core.mjs';

const USERS_PATH = '/api/account/admin/users';
const COLUMNS = ['user_id', 'display_name', 'username', 'directory_opt_out', 'created_at', 'updated_at'];
const SELECT = COLUMNS.join(',');
const ORDER = [['display_name', 'asc'], ['user_id', 'asc']];
const EDITABLE = new Set(['displayName', 'directoryOptOut']);
const ACTIONS = new Set(['grant', 'revoke']);
const READ_LIMIT = 60;
const WRITE_LIMIT = 30;
const WINDOW_MS = 60_000;
const MAX_DISPLAY_NAME = 100;
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

function adminError(status, code, message) {
	return Object.assign(new Error(message), { status, code });
}

/** The row as the allowlist names it, in the shape the panel reads. */
function userEntry(row) {
	return {
		userId: row.user_id,
		displayName: row.display_name,
		username: row.username ?? null,
		directoryOptOut: row.directory_opt_out === true,
		createdAt: row.created_at ?? null,
		updatedAt: row.updated_at ?? null,
	};
}

/** A caller value in an error message: no control character, no long tail. */
const label = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 64);

function targetOf(pathname, suffix = '') {
	const raw = pathname.slice(USERS_PATH.length + 1, suffix ? -suffix.length : undefined);
	let id = '';
	try { id = decodeURIComponent(raw); } catch { /* falls through to the 422 */ }
	if (!UUID_REGEX.test(id)) throw adminError(422, 'invalid_user_id', 'The user id must be a UUID.');
	return id.toLowerCase();
}

function requestMeta(request, config) {
	const meta = clientMeta(request, { ipHeader: config.clientIpHeader, hashSecret: config.ipHashSecret });
	if (!config.clientIpHeader) Object.assign(meta, { ipPrefix: null, ipHash: null });
	return meta;
}

async function readBody(request) {
	let body;
	try {
		body = await readJsonBody(request);
	} catch (error) {
		if (error?.status === 400) throw adminError(422, 'invalid_body', 'The request body must be a JSON object.');
		throw error;
	}
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		throw adminError(422, 'invalid_body', 'The request body must be a JSON object.');
	}
	return body;
}

/** The throttle; the window is told to the caller in the body and in the header. */
async function throttle({ kv, config }, parts, limit, response) {
	try {
		await rateLimit(kv, parts, { limit, windowMs: WINDOW_MS });
	} catch (error) {
		if (error?.status !== 429) throw error;
		const retryAfterSeconds = Number.isFinite(error?.retryAfterSeconds) ? error.retryAfterSeconds : WINDOW_MS / 1_000;
		response.setHeader('retry-after', String(retryAfterSeconds));
		sendJson(response, 429, { ok: false, message: 'Too many requests.', code: 'rate_limited', retryAfterSeconds }, config);
		return true;
	}
	return false;
}

/** The patch the body asks for, as columns. Anything the panel may not edit is refused by name. */
function profilePatch(body) {
	const patch = {};
	for (const key of Object.keys(body)) {
		if (!EDITABLE.has(key)) throw adminError(422, 'field_not_editable', `The field ${label(key)} cannot be edited here.`);
	}
	if (body.displayName !== undefined) {
		const name = typeof body.displayName === 'string' ? body.displayName.trim() : '';
		if (name.length < 1 || name.length > MAX_DISPLAY_NAME || CONTROL_CHARS.test(name)) {
			throw adminError(422, 'invalid_display_name', `The display name must be 1 to ${MAX_DISPLAY_NAME} characters, without control characters.`);
		}
		patch.display_name = name;
	}
	if (body.directoryOptOut !== undefined) {
		if (typeof body.directoryOptOut !== 'boolean') throw adminError(422, 'invalid_body', 'directoryOptOut must be true or false.');
		patch.directory_opt_out = body.directoryOptOut;
	}
	if (Object.keys(patch).length === 0) throw adminError(422, 'invalid_body', 'Nothing to change.');
	return patch;
}

async function listUsers(ctx, url, response) {
	const { client, config } = ctx;
	const rawCursor = url.searchParams.get('cursor');
	const cursor = rawCursor ? decodeCursor(rawCursor, ORDER.length) : undefined;
	const { query, take } = keyset({ order: ORDER, cursor, limit: url.searchParams.get('limit') });
	const rows = await client.get(`osionos_profiles?select=${SELECT}&${query}`);
	const page = pageOf(Array.isArray(rows) ? rows : [], ORDER, take);
	return sendJson(response, 200, { ok: true, users: page.items.map(userEntry), nextCursor: page.nextCursor }, config);
}

async function readUser(ctx, userId, response) {
	const { client, config } = ctx;
	const rows = await client.get(`osionos_profiles?user_id=eq.${userId}&select=${SELECT}&limit=1`);
	if (!Array.isArray(rows) || rows.length === 0) throw adminError(404, 'user_not_found', 'User not found.');
	const { names } = await readPlatformRole(client, userId);
	return sendJson(response, 200, { ok: true, user: userEntry(rows[0]), roles: names }, config);
}

async function patchUser(ctx, request, userId, response) {
	const { client, config, pg, session } = ctx;
	const patch = profilePatch(await readBody(request));
	await writeAudit(pg, {
		session,
		meta: requestMeta(request, config),
		eventType: 'admin_user_update',
		details: { targetUserId: userId, fields: Object.keys(patch) },
	});
	const rows = await client.patch(`osionos_profiles?user_id=eq.${userId}&select=${SELECT}`, patch, { prefer: 'return=representation' });
	if (!Array.isArray(rows) || rows.length === 0) throw adminError(404, 'user_not_found', 'User not found.');
	return sendJson(response, 200, { ok: true, user: userEntry(rows[0]) }, config);
}

async function changeRole(ctx, request, userId, response) {
	const { client, config, pg, session } = ctx;
	const { role, action } = await readBody(request);
	if (!isPlatformRole(role) || !ACTIONS.has(action)) throw adminError(422, 'invalid_role', 'The role or the action is not one the platform knows.');
	// A lockout is cheaper to refuse than to repair: the only way back is the env admin list.
	if (action === 'revoke' && role === 'admin' && userId === session.userId.toLowerCase()) {
		throw adminError(422, 'self_role_change', 'You cannot revoke your own admin role.');
	}
	const found = await client.get(`roles?name=eq.${role}&select=id&limit=1`);
	const roleId = Array.isArray(found) ? found[0]?.id : null;
	// The four rows are seeded by grobase's migrations: a missing one is a broken install.
	if (!roleId) throw pgError(503, 'platform_roles_unavailable');
	await writeAudit(pg, {
		session,
		meta: requestMeta(request, config),
		eventType: 'admin_role_change',
		details: { targetUserId: userId, role, action },
	});
	if (action === 'grant') {
		await client.post('user_roles?on_conflict=user_id,role_id', { user_id: userId, role_id: roleId }, { prefer: 'resolution=merge-duplicates,return=minimal' });
	} else {
		await client.del(`user_roles?user_id=eq.${userId}&role_id=eq.${roleId}`, { prefer: 'return=minimal' });
	}
	const { names } = await readPlatformRole(client, userId);
	return sendJson(response, 200, { ok: true, roles: names }, config);
}

/** The admin routes. The gate runs first and reads the roles from the database. */
export function createAdminUsersRoutes({ config, pg, kv, verifySession }) {
	return async function handleAdminUsers(url, request, response) {
		const pathname = url.pathname;
		if (pathname !== USERS_PATH && !pathname.startsWith(`${USERS_PATH}/`)) return false;
		const session = verifySession(bearerToken(request), config);
		const client = pg.asService();
		const { role } = await readPlatformRole(client, session.userId);
		if (!roleAtLeast(role, 'admin')) throw adminError(403, 'admin_required', 'This action needs the admin role.');
		const ctx = { config, pg, kv, session, client };
		const isRead = request.method === 'GET';
		const limited = await throttle(ctx, ['admin-users', isRead ? 'read' : 'write', session.userId], isRead ? READ_LIMIT : WRITE_LIMIT, response);
		if (limited) return true;
		const method = request.method;
		if (pathname === USERS_PATH) return method === 'GET' ? listUsers(ctx, url, response) : false;
		if (pathname.endsWith('/roles')) return method === 'PUT' ? changeRole(ctx, request, targetOf(pathname, '/roles'), response) : false;
		if (method === 'GET') return readUser(ctx, targetOf(pathname), response);
		if (method === 'PATCH') return patchUser(ctx, request, targetOf(pathname), response);
		return false;
	};
}
