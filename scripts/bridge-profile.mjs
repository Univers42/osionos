/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-profile.mjs                                  :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Profiles, avatars, people search and presence for the osionos bridge —
 * standalone module in the bridge-rtc style (bridge-api.mjs injects `config`
 * + `verifySession`).
 *
 * Routes:
 *   GET  /api/people?query=          search org members by display_name
 *                                    (emails are HMAC-hashed at rest — raw
 *                                    email search is impossible by design)
 *   GET  /api/profile/:userId        display name, avatar, org role, presence
 *   POST /api/profile/avatar         {dataUrl} ≤200KB → identities.profile.avatar
 *   POST /api/profile/heartbeat      presence: bumps identities.last_seen_at
 *
 * PRESENCE MODEL (documented decision): the realtime gateway's WS PUBLISH
 * frame exists, but presence through it would tie liveness to a browser
 * socket the bridge cannot see. The simpler reliable path: clients POST
 * /api/profile/heartbeat every ~45s; anyone with last_seen_at < 90s ago is
 * shown online. Single writer (the bridge), one indexed column, no fanout.
 */

import {
	UUID_REGEX,
	bearerToken,
	httpError,
	orgWorkspaceId,
	readJsonBody,
	requireUuid,
	rest,
	safeText,
	sendJson,
} from './bridge-social-core.mjs';

const AVATAR_MAX_BYTES = 200 * 1024;
const AVATAR_BODY_LIMIT = 320 * 1024;
const PRESENCE_WINDOW_MS = 90 * 1000;
const DATA_URL_PATTERN = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

function isOnline(lastSeenAt, now = Date.now()) {
	if (!lastSeenAt) return false;
	const seen = Date.parse(lastSeenAt);
	return Number.isFinite(seen) && now - seen < PRESENCE_WINDOW_MS;
}

async function identityRow(config, fetchImpl, userId) {
	const rows = await rest(
		config,
		fetchImpl,
		`osionos_bridge_identities?user_id=eq.${userId}&select=user_id,display_name,profile,last_seen_at&limit=1`,
	);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** Org-workspace role first, else the user's first membership row. */
async function workspaceRole(config, fetchImpl, userId, env) {
	const rows = await rest(config, fetchImpl, `osionos_workspace_members?user_id=eq.${userId}&select=workspace_id,role`);
	const memberships = Array.isArray(rows) ? rows : [];
	const orgId = orgWorkspaceId(env);
	const orgRow = orgId ? memberships.find((row) => row.workspace_id === orgId) : null;
	return { role: (orgRow ?? memberships[0])?.role ?? null, workspaceId: (orgRow ?? memberships[0])?.workspace_id ?? null };
}

async function getProfile(deps, userId, response, config) {
	const row = await identityRow(config, deps.fetchImpl, userId);
	if (!row) throw httpError('Profile not found.', 404);
	const profile = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
	const { role, workspaceId } = await workspaceRole(config, deps.fetchImpl, userId, deps.env);
	return sendJson(response, 200, {
		ok: true,
		userId,
		name: row.display_name ?? 'Member',
		avatar: typeof profile.avatar === 'string' ? profile.avatar : null,
		role,
		workspaceId,
		lastSeenAt: row.last_seen_at ?? null,
		online: isOnline(row.last_seen_at),
	}, config);
}

async function postAvatar(deps, session, request, response, config) {
	const payload = await readJsonBody(request, AVATAR_BODY_LIMIT);
	const dataUrl = String(payload.dataUrl ?? '');
	if (!DATA_URL_PATTERN.test(dataUrl)) throw httpError('dataUrl must be a base64 image data URL.', 422);
	if (Buffer.byteLength(dataUrl, 'utf8') > AVATAR_MAX_BYTES) throw httpError('Avatar exceeds the 200KB limit.', 413);
	const row = await identityRow(config, deps.fetchImpl, session.userId);
	if (!row) throw httpError('Profile not found.', 404);
	const profile = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
	const nextProfile = { ...profile, avatar: dataUrl, avatarUpdatedAt: new Date().toISOString() };
	await rest(config, deps.fetchImpl, `osionos_bridge_identities?user_id=eq.${session.userId}`, {
		method: 'PATCH',
		body: { profile: nextProfile, updated_at: new Date().toISOString() },
		prefer: 'return=minimal',
	});
	return sendJson(response, 200, { ok: true, userId: session.userId, avatar: dataUrl }, config);
}

async function heartbeat(deps, session, response, config) {
	const now = new Date().toISOString();
	await rest(config, deps.fetchImpl, `osionos_bridge_identities?user_id=eq.${session.userId}`, {
		method: 'PATCH',
		body: { last_seen_at: now },
		prefer: 'return=minimal',
	});
	return sendJson(response, 200, { ok: true, lastSeenAt: now }, config);
}

async function searchPeople(deps, url, response, config) {
	const query = safeText(url.searchParams.get('query') ?? url.searchParams.get('q'), 80);
	const orgId = orgWorkspaceId(deps.env);
	let memberRoleByUser = null;
	if (orgId) {
		const memberRows = await rest(config, deps.fetchImpl, `osionos_workspace_members?workspace_id=eq.${orgId}&select=user_id,role`);
		memberRoleByUser = new Map((Array.isArray(memberRows) ? memberRows : []).map((row) => [row.user_id, row.role]));
	}
	let path = 'osionos_bridge_identities?select=user_id,display_name,profile,last_seen_at&order=display_name.asc&limit=50';
	if (query) path += `&display_name=ilike.${encodeURIComponent(`*${query}*`)}`;
	const rows = await rest(config, deps.fetchImpl, path);
	const people = [];
	for (const row of Array.isArray(rows) ? rows : []) {
		if (memberRoleByUser && !memberRoleByUser.has(row.user_id)) continue; // org members only
		const profile = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
		people.push({
			id: row.user_id,
			name: row.display_name ?? 'Member',
			avatar: typeof profile.avatar === 'string' ? profile.avatar : null,
			wsRole: memberRoleByUser?.get(row.user_id) ?? null,
			online: isOnline(row.last_seen_at),
		});
		if (people.length >= 20) break;
	}
	return sendJson(response, 200, { ok: true, people }, config);
}

/**
 * Build the /api/profile + /api/people dispatcher: `await handler(url,
 * request, response)` → true when handled. deps: { config, verifySession,
 * fetchImpl?, env? }.
 */
export function createProfileHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
	return async function handleProfileRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		const isPeople = pathname === '/api/people';
		if (!pathname.startsWith('/api/profile/') && !isPeople) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (isPeople && method === 'GET') return await searchPeople(deps, url, response, requestConfig);
			if (pathname === '/api/profile/avatar' && method === 'POST') return await postAvatar(deps, session, request, response, requestConfig);
			if (pathname === '/api/profile/heartbeat' && method === 'POST') return await heartbeat(deps, session, response, requestConfig);
			const profileMatch = /^\/api\/profile\/([0-9a-f-]{36})$/i.exec(pathname);
			if (profileMatch && method === 'GET') {
				return await getProfile(deps, requireUuid(profileMatch[1], 'userId'), response, requestConfig);
			}
			if (UUID_REGEX.test(pathname.slice('/api/profile/'.length))) {
				throw httpError(`Method ${method} is not supported here.`, 405);
			}
			return sendJson(response, 404, { ok: false, message: 'Profile route not found.' }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Profile request failed.' }, requestConfig);
		}
	};
}
