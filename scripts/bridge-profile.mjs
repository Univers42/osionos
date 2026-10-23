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
 *   POST /api/profile/heartbeat      presence: the beat, nothing else
 *
 * The avatar routes live in bridge-avatar.mjs (the account seam): the bytes go
 * to storage and the profile column holds the path. This module only projects
 * an avatar, and never a `data:` URL.
 *
 * PRESENCE MODEL: the realtime gateway's WS PUBLISH frame exists, but presence through
 * it would tie liveness to a browser socket the bridge cannot see. The simpler reliable
 * path: clients POST /api/profile/heartbeat every ~45s and the beat is a key/value
 * write (bridge-presence.mjs); the database column is refreshed at most once every ten
 * minutes, and every surface that shows "online" reads the key/value store.
 *
 * L0 runs BEFORE a profile is written (bridge-moderation-gate.mjs): the words
 * THIS PATCH sets (bio, headline, location, username) are checked, and a
 * warning is the author's question (409) — nothing is written until they answer
 * it with acknowledgeWarning: true. WARN-ONLY: osionos_bridge_identities has
 * no moderation_state column, so nothing is ever written held and no audit row
 * is ever written.
 */

import {
	UUID_REGEX,
	bearerToken,
	blockedViewerBy,
	directoryFuzzyFilter,
	httpError,
	memberWorkspacesAmong,
	moderationWarningBody,
	orgWorkspaceId,
	readInChunks,
	readJsonBody,
	requireUuid,
	rest,
	safeText,
	sendJson,
} from './bridge-social-core.mjs';
import { inFilter } from './bridge-paging.mjs';
import { publicAvatar } from './bridge-avatar.mjs';
import { canReadPageRowAsMember } from './bridge-page-read.mjs';
import { onlineAmong, recordHeartbeat } from './bridge-presence.mjs';
import { askBeforeWrite } from './bridge-moderation-gate.mjs';



/** G6 F5: ids are compared as strings (block set, self check), so a UUID is lower-cased at the
 *  boundary; otherwise `/api/profile/<UPPERCASE>` walks past the block list. */
function profileUserId(value) {
	return requireUuid(value, 'userId').toLowerCase();
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

/**
 * The avatar of a user, as the rest of the plane shows it: the stored path
 * first (the profile column owns it since P0-6), the legacy blob after, and
 * never a `data:` URL.
 */
async function avatarOf(config, fetchImpl, userId, profile) {
	const rows = await rest(config, fetchImpl, `osionos_profiles?user_id=eq.${userId}&select=avatar_url&limit=1`);
	const row = Array.isArray(rows) ? rows[0] ?? null : null;
	const stored = typeof row?.avatar_url === 'string' && row.avatar_url ? row.avatar_url : null;
	const legacy = typeof profile?.avatar === 'string' ? profile.avatar : null;
	return publicAvatar(stored ?? legacy, config);
}

async function getProfile(deps, session, userId, response, config) {
	const row = await identityRow(config, deps.fetchImpl, userId);
	if (!row) throw httpError('Profile not found.', 404);
	const profile = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
	// G6 F5: the directory opt-out and blocks hold when a profile is addressed by id too;
	// the user themselves always gets the full card.
	if (userId !== session.userId && (row.directory_opt_out === true || (await blockedViewerBy(config, deps.fetchImpl, session.userId)).has(userId))) {
		return sendJson(response, 200, {
			ok: true,
			userId,
			name: row.display_name ?? 'Member',
			avatar: await avatarOf(config, deps.fetchImpl, userId, profile),
		}, config);
	}
	const { role, workspaceId } = await workspaceRole(config, deps.fetchImpl, userId, deps.env);
	const fields = profile.fields && typeof profile.fields === 'object' && !Array.isArray(profile.fields) ? profile.fields : {};
	const online = await onlineAmong(deps.kv, [userId], { now: deps.now() });
	return sendJson(response, 200, {
		ok: true,
		userId,
		name: row.display_name ?? 'Member',
		avatar: await avatarOf(config, deps.fetchImpl, userId, profile),
		role,
		workspaceId,
		// Caveat: the column is refreshed at most once every ten minutes, so this value is
		// coarse; `online` below is the exact one.
		lastSeenAt: row.last_seen_at ?? null,
		online: online.has(userId),
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

async function heartbeat(deps, session, response, config) {
	// The body of the request is never read: the clock is the server's.
	await recordHeartbeat(deps.kv, { userId: session.userId, config, fetchImpl: deps.fetchImpl, now: deps.now() });
	response.writeHead(204, {
		'cache-control': 'no-store',
		'access-control-allow-origin': config.allowedOrigin,
		'access-control-allow-credentials': 'true',
		vary: 'Origin',
	});
	response.end();
	return true;
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
	let path = 'osionos_people_directory?select=user_id,display_name,username,profile,directory_opt_out&order=display_name.asc&limit=200';
	path += '&directory_opt_out=not.eq.true';
	path += directoryFuzzyFilter(query); // fuzzy: name/username/headline ILIKE + stem + FTS
	const rows = await rest(config, deps.fetchImpl, path);
	const blockers = await blockedViewerBy(config, deps.fetchImpl, session.userId);
	const people = [];
	for (const row of Array.isArray(rows) ? rows : []) {
		if (row.directory_opt_out === true) continue; // honour opt-out
		if (memberRoleByUser && !memberRoleByUser.has(row.user_id)) continue; // org members only
		if (blockers.has(row.user_id)) continue; // target blocked the viewer
		people.push(row);
		if (people.length >= 20) break;
	}
	const online = await onlineAmong(deps.kv, people.map((row) => row.user_id), { now: deps.now() });
	return sendJson(response, 200, {
		ok: true,
		people: people.map((row) => {
			const profile = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
			return {
				id: row.user_id,
				name: row.display_name ?? 'Member',
				username: row.username ?? null,
				avatar: publicAvatar(typeof profile.avatar === 'string' ? profile.avatar : null, config),
				headline: typeof profile.headline === 'string' ? profile.headline : null,
				wsRole: memberRoleByUser?.get(row.user_id) ?? null,
				online: online.has(row.user_id),
			};
		}),
	}, config);
}

async function patchMe(deps, session, request, response, config) {
	const payload = await readJsonBody(request);
	// P1-2b: the username moved behind the step-up proof, and this route is the one
	// path that would write it without it. The whole body is refused, so no other
	// field of it is applied either.
	if (Object.hasOwn(payload, 'username')) {
		return sendJson(response, 422, {
			ok: false,
			code: 'username_moved',
			message: 'The username is changed through POST /api/account/username, behind a step-up proof.',
		}, config);
	}
	const row = await identityRow(config, deps.fetchImpl, session.userId);
	if (!row) throw httpError('Profile not found.', 404);
	const profile = row.profile && typeof row.profile === 'object' && !Array.isArray(row.profile) ? row.profile : {};
	const update = { updated_at: new Date().toISOString() };
	const nextProfile = { ...profile };
	for (const [key, limit] of [['bio', 2000], ['headline', 200], ['location', 120]]) {
		if (Object.hasOwn(payload, key)) nextProfile[key] = safeText(payload[key], limit) || null;
	}
	update.profile = nextProfile;
	if (Object.hasOwn(payload, 'directoryOptOut')) update.directory_opt_out = payload.directoryOptOut === true;
	// L0 asks BEFORE the profile is written: the words THIS PATCH sets are the
	// ones checked (only the keys it carries — a PATCH that only opts out of the
	// directory says nothing new about anybody). A warning is the author's
	// question (409) and nothing is written until they answer it.
	const written = [];
	for (const key of ['bio', 'headline', 'location']) {
		if (Object.hasOwn(payload, key)) written.push(nextProfile[key] ?? '');
	}
	if (Object.hasOwn(payload, 'username')) written.push(update.username ?? '');
	if (written.length > 0) {
		const decision = askBeforeWrite({ text: written.join('\n'), surface: 'profile', env: deps.env, payload });
		if (decision.outcome === 'needs_ack') return sendJson(response, 409, moderationWarningBody(decision), config);
	}
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
 * fetchImpl?, env?, kv?, now? }.
 */
/**
 * GET /api/profile/:userId/shares — the posts this member shared to their profile
 * (osionos_feed_shares target=profile), newest first + de-duped, with page
 * title/icon/cover for a gallery render. A page the VIEWER may not see (not a member
 * of its workspace, or not allowed to read it) is left out. Pages outside
 * osionos_pages (live-DB rows) render as "Untitled".
 */
async function listProfileShares(deps, session, userId, response, config) {
	// in.(profile), not eq.profile: the baas WAF (CRS 930120) reads ".profile" as an OS-file read and
	// 403s the whole request (measured 2026-10-18 on baas: same query without the filter, 200).
	const shares = await rest(config, deps.fetchImpl, `osionos_feed_shares?user_id=eq.${userId}&target=in.(profile)&select=page_id,created_at&order=created_at.desc&limit=60`);
	const list = Array.isArray(shares) ? shares : [];
	const pageIds = [...new Set(list.map((row) => row.page_id).filter((id) => UUID_REGEX.test(String(id))))];
	const pagesById = new Map();
	if (pageIds.length > 0) {
		const pages = await readInChunks(pageIds, async (chunk) => {
			const part = await rest(config, deps.fetchImpl, `osionos_pages?${inFilter('id', chunk)}&select=id,title,icon,cover,workspace_id,owner_id,visibility,collaborators`);
			return Array.isArray(part) ? part : [];
		});
		for (const page of pages) pagesById.set(page.id, page);
	}
	const members = await memberWorkspacesAmong(config, deps.fetchImpl, session, [...pagesById.values()].map((page) => page.workspace_id));
	const seen = new Set();
	const items = [];
	for (const row of list) {
		if (seen.has(row.page_id)) continue; // one card per page (latest share), not every re-share
		seen.add(row.page_id);
		const page = pagesById.get(row.page_id);
		if (page && !canReadPageRowAsMember(page, session.userId, members)) continue;
		items.push({ pageId: row.page_id, title: page?.title || 'Untitled', icon: page?.icon ?? null, cover: page?.cover ?? null, sharedAt: row.created_at });
	}
	return sendJson(response, 200, { ok: true, shares: items }, config);
}

export function createProfileHandler({ config, verifySession, fetchImpl = fetch, env = process.env, kv = null, now = Date.now }) {
	const deps = { fetchImpl, env, kv, now };
	return async function handleProfileRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		const isPeople = pathname === '/api/people';
		const isEmbed = pathname === '/api/directory/embed';
		// The avatar routes belong to the account seam (bridge-avatar.mjs). This
		// handler is dispatched first, so it must not even claim the path: the
		// dispatch order must not decide who answers.
		if (pathname === '/api/profile/avatar' || pathname === '/api/profile/banner') return false;
		if (!pathname.startsWith('/api/profile/') && !isPeople && !isEmbed) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (isPeople && method === 'GET') return await searchPeople(deps, session, url, response, requestConfig);
			if (isEmbed && method === 'POST') return await embedDirectory(deps, session, response, requestConfig);
			if (pathname === '/api/profile/me' && method === 'PATCH') return await patchMe(deps, session, request, response, requestConfig);
			if (pathname === '/api/profile/heartbeat' && method === 'POST') return await heartbeat(deps, session, response, requestConfig);
			const sharesMatch = /^\/api\/profile\/([0-9a-f-]{36})\/shares$/i.exec(pathname);
			if (sharesMatch && method === 'GET') {
				return await listProfileShares(deps, session, profileUserId(sharesMatch[1]), response, requestConfig);
			}
			const profileMatch = /^\/api\/profile\/([0-9a-f-]{36})$/i.exec(pathname);
			if (profileMatch && method === 'GET') {
				return await getProfile(deps, session, profileUserId(profileMatch[1]), response, requestConfig);
			}
			if (UUID_REGEX.test(pathname.slice('/api/profile/'.length))) {
				throw httpError(`Method ${method} is not supported here.`, 405);
			}
			return sendJson(response, 404, { ok: false, message: 'Profile route not found.' }, requestConfig);
		} catch (error) {
			const body = { ok: false, message: error instanceof Error ? error.message : 'Profile request failed.' };
			if (error?.code) body.code = error.code;
			return sendJson(response, error?.status ?? 500, body, requestConfig);
		}
	};
}
