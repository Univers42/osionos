/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-communities.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Communities for the osionos messenger — server-side groupings of chat
 * channels with their own membership/roles. Service-role PostgREST through the
 * shared core; the bridge enforces membership itself (RLS is defence in depth).
 * Tables: osionos_communities / osionos_community_channels / _members
 * (models/osionos-communities-migration.sql).
 *
 * Routes (all under /api/communities, wired in bridge-api.mjs):
 *   POST /api/communities                 {name,description?,avatar?}
 *   GET  /api/communities                 communities I belong to
 *   GET  /api/communities/:id             one community + its channels (member)
 *   POST /api/communities/:id/channels    {channelId} (owner/admin)
 *   POST /api/communities/:id/join        self-join (creates a member row)
 */

import {
	UUID_REGEX,
	bearerToken,
	httpError,
	readJsonBody,
	requireUuid,
	rest,
	safeText,
	sendJson,
} from './bridge-social-core.mjs';

function communityEntry(row, role = null) {
	return {
		id: row.id,
		name: row.name,
		avatar: row.avatar ?? null,
		description: row.description ?? null,
		creatorId: row.creator_id ?? null,
		role,
		createdAt: row.created_at ?? null,
	};
}

/** osionos_community_members row for (community, user) or null. */
async function communityMember(config, fetchImpl, communityId, userId) {
	const rows = await rest(config, fetchImpl, `osionos_community_members?community_id=eq.${communityId}&user_id=eq.${userId}&select=role&limit=1`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function createCommunity(deps, session, request, response, config) {
	const payload = await readJsonBody(request);
	const name = safeText(payload.name, 80);
	if (!name) throw httpError('Community name is required.', 422);
	const rows = await rest(config, deps.fetchImpl, 'osionos_communities', {
		method: 'POST',
		body: {
			name,
			description: safeText(payload.description, 500) || null,
			avatar: safeText(payload.avatar, 1024) || null,
			creator_id: session.userId,
		},
		prefer: 'return=representation',
	});
	const row = Array.isArray(rows) ? rows[0] : rows;
	if (!row) throw httpError('Community creation failed.', 502);
	await rest(config, deps.fetchImpl, 'osionos_community_members?on_conflict=community_id,user_id', {
		method: 'POST',
		body: { community_id: row.id, user_id: session.userId, role: 'owner' },
		prefer: 'resolution=ignore-duplicates,return=minimal',
	});
	return sendJson(response, 201, { ok: true, community: communityEntry(row, 'owner') }, config);
}

async function listCommunities(deps, session, response, config) {
	const memberRows = await rest(config, deps.fetchImpl, `osionos_community_members?user_id=eq.${session.userId}&select=community_id,role`);
	const roleById = new Map((Array.isArray(memberRows) ? memberRows : []).map((row) => [row.community_id, row.role]));
	const ids = [...roleById.keys()].filter((id) => UUID_REGEX.test(String(id)));
	if (ids.length === 0) return sendJson(response, 200, { ok: true, communities: [] }, config);
	const rows = await rest(config, deps.fetchImpl, `osionos_communities?id=in.(${ids.join(',')})&select=*&order=created_at.desc`);
	const communities = (Array.isArray(rows) ? rows : []).map((row) => communityEntry(row, roleById.get(row.id) ?? null));
	return sendJson(response, 200, { ok: true, communities }, config);
}

async function getCommunity(deps, session, communityId, response, config) {
	const member = await communityMember(config, deps.fetchImpl, communityId, session.userId);
	if (!member) throw httpError('You are not a member of this community.', 403);
	const rows = await rest(config, deps.fetchImpl, `osionos_communities?id=eq.${communityId}&select=*&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row) throw httpError('Community not found.', 404);
	const linkRows = await rest(config, deps.fetchImpl, `osionos_community_channels?community_id=eq.${communityId}&select=channel_id`);
	const channelIds = (Array.isArray(linkRows) ? linkRows : []).map((link) => link.channel_id).filter((id) => UUID_REGEX.test(String(id)));
	let channels = [];
	if (channelIds.length > 0) {
		const chanRows = await rest(config, deps.fetchImpl, `osionos_channels?id=in.(${channelIds.join(',')})&select=id,workspace_id,kind,name,topic&order=created_at.asc`);
		channels = (Array.isArray(chanRows) ? chanRows : []).map((c) => ({ id: c.id, workspaceId: c.workspace_id, kind: c.kind, name: c.name, topic: c.topic ?? null }));
	}
	return sendJson(response, 200, { ok: true, community: communityEntry(row, member.role), channels }, config);
}

async function addCommunityChannel(deps, session, request, communityId, response, config) {
	const member = await communityMember(config, deps.fetchImpl, communityId, session.userId);
	if (!member || (member.role !== 'owner' && member.role !== 'admin')) throw httpError('Only an owner or admin can add channels.', 403);
	const payload = await readJsonBody(request);
	const channelId = requireUuid(payload.channelId, 'channelId');
	await rest(config, deps.fetchImpl, 'osionos_community_channels?on_conflict=community_id,channel_id', {
		method: 'POST',
		body: { community_id: communityId, channel_id: channelId },
		prefer: 'resolution=ignore-duplicates,return=minimal',
	});
	return sendJson(response, 200, { ok: true, communityId, channelId }, config);
}

async function joinCommunity(deps, session, communityId, response, config) {
	const rows = await rest(config, deps.fetchImpl, `osionos_communities?id=eq.${communityId}&select=id&limit=1`);
	if (!(Array.isArray(rows) && rows[0])) throw httpError('Community not found.', 404);
	await rest(config, deps.fetchImpl, 'osionos_community_members?on_conflict=community_id,user_id', {
		method: 'POST',
		body: { community_id: communityId, user_id: session.userId, role: 'member' },
		prefer: 'resolution=ignore-duplicates,return=minimal',
	});
	return sendJson(response, 200, { ok: true, communityId, joined: true }, config);
}

/** Build the /api/communities dispatcher. deps: { config, verifySession, fetchImpl?, env? }. */
export function createCommunityHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
	return async function handleCommunityRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		if (!pathname.startsWith('/api/communities')) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (pathname === '/api/communities' && method === 'GET') return await listCommunities(deps, session, response, requestConfig);
			if (pathname === '/api/communities' && method === 'POST') return await createCommunity(deps, session, request, response, requestConfig);
			const channels = /^\/api\/communities\/([0-9a-f-]{36})\/channels$/i.exec(pathname);
			if (channels && method === 'POST') return await addCommunityChannel(deps, session, request, requireUuid(channels[1], 'communityId'), response, requestConfig);
			const join = /^\/api\/communities\/([0-9a-f-]{36})\/join$/i.exec(pathname);
			if (join && method === 'POST') return await joinCommunity(deps, session, requireUuid(join[1], 'communityId'), response, requestConfig);
			const one = /^\/api\/communities\/([0-9a-f-]{36})$/i.exec(pathname);
			if (one && method === 'GET') return await getCommunity(deps, session, requireUuid(one[1], 'communityId'), response, requestConfig);
			return sendJson(response, 404, { ok: false, message: 'Community route not found.' }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Community request failed.' }, requestConfig);
		}
	};
}
