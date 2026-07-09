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
	blockedViewerBy,
	directoryFuzzyFilter,
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
		`osionos_bridge_identities?user_id=eq.${userId}&select=user_id,display_name,username,profile,created_at,last_seen_at,directory_opt_out&limit=1`,
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
	const fields = profile.fields && typeof profile.fields === 'object' && !Array.isArray(profile.fields) ? profile.fields : {};
	return sendJson(response, 200, {
		ok: true,
		userId,
		name: row.display_name ?? 'Member',
		avatar: typeof profile.avatar === 'string' ? profile.avatar : null,
		role,
		workspaceId,
		lastSeenAt: row.last_seen_at ?? null,
		online: isOnline(row.last_seen_at),
		// Widened fields the admin-authored profile template binds to.
		username: typeof row.username === 'string' ? row.username : null,
		headline: typeof profile.headline === 'string' ? profile.headline : null,
		bio: typeof profile.bio === 'string' ? profile.bio : null,
		location: typeof profile.location === 'string' ? profile.location : null,
		joinedAt: row.created_at ?? null,
		directoryOptOut: row.directory_opt_out === true,
		customFields: fields,
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

async function searchPeople(deps, session, url, response, config) {
	const query = safeText(url.searchParams.get('query') ?? url.searchParams.get('q'), 80);
	const scope = safeText(url.searchParams.get('scope'), 16) || 'org';
	const orgId = orgWorkspaceId(deps.env);
	let memberRoleByUser = null;
	if (scope !== 'global' && orgId) {
		const memberRows = await rest(config, deps.fetchImpl, `osionos_workspace_members?workspace_id=eq.${orgId}&select=user_id,role`);
		memberRoleByUser = new Map((Array.isArray(memberRows) ? memberRows : []).map((row) => [row.user_id, row.role]));
	}
	// Authoritative people via the safe osionos_people_directory view (public.users).
	let path = 'osionos_people_directory?select=user_id,display_name,username,profile,last_seen_at,directory_opt_out&order=display_name.asc&limit=200';
	path += '&directory_opt_out=not.eq.true';
	path += directoryFuzzyFilter(query); // fuzzy: name/username/headline ILIKE + stem + FTS
	const rows = await rest(config, deps.fetchImpl, path);
	const blockers = await blockedViewerBy(config, deps.fetchImpl, session.userId);
	const people = [];
	for (const row of Array.isArray(rows) ? rows : []) {
		if (row.directory_opt_out === true) continue; // honour opt-out
		if (memberRoleByUser && !memberRoleByUser.has(row.user_id)) continue; // org members only
		if (blockers.has(row.user_id)) continue; // target blocked the viewer
		const profile = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
		people.push({
			id: row.user_id,
			name: row.display_name ?? 'Member',
			username: row.username ?? null,
			avatar: typeof profile.avatar === 'string' ? profile.avatar : null,
			headline: typeof profile.headline === 'string' ? profile.headline : null,
			wsRole: memberRoleByUser?.get(row.user_id) ?? null,
			online: isOnline(row.last_seen_at),
		});
		if (people.length >= 20) break;
	}
	return sendJson(response, 200, { ok: true, people }, config);
}

async function patchMe(deps, session, request, response, config) {
	const payload = await readJsonBody(request);
	const row = await identityRow(config, deps.fetchImpl, session.userId);
	if (!row) throw httpError('Profile not found.', 404);
	const profile = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
	const update = { updated_at: new Date().toISOString() };
	const nextProfile = { ...profile };
	for (const [key, limit] of [['bio', 2000], ['headline', 200], ['location', 120]]) {
		if (Object.hasOwn(payload, key)) nextProfile[key] = safeText(payload[key], limit) || null;
	}
	update.profile = nextProfile;
	if (Object.hasOwn(payload, 'username')) update.username = safeText(payload.username, 48) || null;
	if (Object.hasOwn(payload, 'directoryOptOut')) update.directory_opt_out = payload.directoryOptOut === true;
	try {
		await rest(config, deps.fetchImpl, `osionos_bridge_identities?user_id=eq.${session.userId}`, {
			method: 'PATCH',
			body: update,
			prefer: 'return=minimal',
		});
	} catch (error) {
		if (/with 409/.test(error?.message ?? '') || error?.status === 409) throw httpError('That username is already taken.', 409);
		throw error;
	}
	return sendJson(response, 200, { ok: true, userId: session.userId, username: update.username ?? row.username ?? null }, config);
}

/** Env-gated embedding stub — real vector embedding is wired later. */
async function embedDirectory(deps, session, response, config) {
	if (!deps.env.OSIONOS_EMBEDDER_URL && !deps.env.OPENAI_API_KEY) {
		return sendJson(response, 200, { ok: true, updated: false }, config);
	}
	return sendJson(response, 200, { ok: true, updated: false, note: 'embedder configured but not yet implemented' }, config);
}

/**
 * Build the /api/profile + /api/people dispatcher: `await handler(url,
 * request, response)` → true when handled. deps: { config, verifySession,
 * fetchImpl?, env? }.
 */
/**
 * GET /api/profile/:userId/shares — the posts this member shared to their profile
 * (osionos_feed_shares target=profile), newest first + de-duped, with page
 * title/icon/cover for a gallery render. Pages outside osionos_pages (live-DB
 * rows) render as "Untitled".
 */
async function listProfileShares(deps, userId, response, config) {
	const shares = await rest(config, deps.fetchImpl, `osionos_feed_shares?user_id=eq.${userId}&target=eq.profile&select=page_id,created_at&order=created_at.desc&limit=60`);
	const list = Array.isArray(shares) ? shares : [];
	const pageIds = [...new Set(list.map((row) => row.page_id).filter((id) => UUID_REGEX.test(String(id))))];
	const pagesById = new Map();
	if (pageIds.length > 0) {
		const pages = await rest(config, deps.fetchImpl, `osionos_pages?id=in.(${pageIds.join(',')})&select=id,title,icon,cover`);
		for (const page of Array.isArray(pages) ? pages : []) pagesById.set(page.id, page);
	}
	const seen = new Set();
	const items = [];
	for (const row of list) {
		if (seen.has(row.page_id)) continue; // one card per page (latest share), not every re-share
		seen.add(row.page_id);
		const page = pagesById.get(row.page_id);
		items.push({ pageId: row.page_id, title: page?.title || 'Untitled', icon: page?.icon ?? null, cover: page?.cover ?? null, sharedAt: row.created_at });
	}
	return sendJson(response, 200, { ok: true, shares: items }, config);
}

export function createProfileHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
	return async function handleProfileRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		const isPeople = pathname === '/api/people';
		const isEmbed = pathname === '/api/directory/embed';
		if (!pathname.startsWith('/api/profile/') && !isPeople && !isEmbed) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (isPeople && method === 'GET') return await searchPeople(deps, session, url, response, requestConfig);
			if (isEmbed && method === 'POST') return await embedDirectory(deps, session, response, requestConfig);
			if (pathname === '/api/profile/me' && method === 'PATCH') return await patchMe(deps, session, request, response, requestConfig);
			if (pathname === '/api/profile/avatar' && method === 'POST') return await postAvatar(deps, session, request, response, requestConfig);
			if (pathname === '/api/profile/heartbeat' && method === 'POST') return await heartbeat(deps, session, response, requestConfig);
			const sharesMatch = /^\/api\/profile\/([0-9a-f-]{36})\/shares$/i.exec(pathname);
			if (sharesMatch && method === 'GET') {
				return await listProfileShares(deps, requireUuid(sharesMatch[1], 'userId'), response, requestConfig);
			}
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
