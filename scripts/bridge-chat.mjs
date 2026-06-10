/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-chat.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Chat persistence for the osionos bridge (`/api/chat/*`) — standalone module
 * in the bridge-rtc style: bridge-api.mjs injects its `config` (configFromEnv)
 * and `verifySession` (verifyAppSessionToken). Storage is the canonical
 * BaaS PostgREST tables from models/osionos-chat-migration.sql.
 *
 * Routes:
 *   GET    /api/chat/channels[?workspaceId=]       channels I belong to + public
 *                                                  text channels of my workspaces
 *   POST   /api/chat/channels                      {workspaceId,name,kind?,topic?,isPrivate?}
 *   GET    /api/chat/channels/:id/messages?before=&limit=
 *   POST   /api/chat/channels/:id/messages         {content,attachments?}
 *   PATCH  /api/chat/messages/:id                  {content} (author only)
 *   DELETE /api/chat/messages/:id                  soft delete (author only)
 *   POST   /api/chat/messages/:id/reactions        {emoji}
 *   DELETE /api/chat/messages/:id/reactions        {emoji} (or ?emoji=)
 *   POST   /api/chat/dm                            {peerUserId, workspaceId?}
 *
 * Membership model: dm/private channels require an osionos_channel_members
 * row; public text channels accept any osionos_workspace_members row of the
 * channel's workspace (checked in the DB — the session token only carries the
 * user's private workspace, the org workspace lives in the members table).
 *
 * After every persisted message/reaction the module publishes (best-effort)
 * to the Rust realtime gateway on `chat:<workspaceId>:<channelId>`.
 */

import {
	UUID_REGEX,
	bearerToken,
	httpError,
	identitySummaries,
	publishRealtime,
	readJsonBody,
	requireUuid,
	rest,
	safeText,
	sendJson,
	workspaceMembership,
} from './bridge-social-core.mjs';

const CHANNEL_KINDS = new Set(['text', 'dm', 'voice', 'video']);
const DEFAULT_PAGE = 50;
const MAX_PAGE = 100;

function channelEntry(row, memberRole = null) {
	return {
		id: row.id,
		workspaceId: row.workspace_id,
		kind: row.kind,
		name: row.name,
		topic: row.topic ?? null,
		createdBy: row.created_by ?? null,
		isPrivate: row.is_private === true,
		memberRole,
		createdAt: row.created_at ?? null,
		updatedAt: row.updated_at ?? null,
	};
}

function messageEntry(row, identity, reactions = []) {
	return {
		id: row.id,
		channelId: row.channel_id,
		authorId: row.author_id,
		authorName: identity?.name ?? 'Member',
		authorAvatar: identity?.avatar ?? null,
		content: row.deleted_at ? '' : row.content,
		attachments: Array.isArray(row.attachments) ? row.attachments : [],
		createdAt: row.created_at,
		editedAt: row.edited_at ?? null,
		deletedAt: row.deleted_at ?? null,
		reactions,
	};
}

async function fetchChannel(config, fetchImpl, channelId) {
	const rows = await rest(config, fetchImpl, `osionos_channels?id=eq.${channelId}&select=*&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row) throw httpError('Channel not found.', 404);
	return row;
}

/** dm/private → channel membership; public text/voice/video → workspace membership. */
async function requireChannelAccess(config, fetchImpl, userId, channelId) {
	const channel = await fetchChannel(config, fetchImpl, channelId);
	const memberRows = await rest(
		config,
		fetchImpl,
		`osionos_channel_members?channel_id=eq.${channelId}&user_id=eq.${userId}&select=role&limit=1`,
	);
	const channelMember = Array.isArray(memberRows) ? memberRows[0] ?? null : null;
	if (channelMember) return { channel, role: channelMember.role };
	if (channel.kind === 'dm' || channel.is_private === true) {
		throw httpError('You are not a member of this channel.', 403);
	}
	const wsMember = await workspaceMembership(config, fetchImpl, userId, channel.workspace_id);
	if (!wsMember) throw httpError('You are not a member of this channel’s workspace.', 403);
	return { channel, role: wsMember.role };
}

async function fetchMessageForAuthor(config, fetchImpl, userId, messageId) {
	const rows = await rest(config, fetchImpl, `osionos_messages?id=eq.${messageId}&select=*&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row || row.deleted_at) throw httpError('Message not found.', 404);
	if (row.author_id !== userId) throw httpError('Only the author can modify this message.', 403);
	return row;
}

function chatTopic(channel) {
	return `chat:${channel.workspace_id}:${channel.id}`;
}

async function listChannels(deps, session, url, response, config) {
	const filterWs = safeText(url.searchParams.get('workspaceId'), 80);
	const memberRows = await rest(config, deps.fetchImpl, `osionos_channel_members?user_id=eq.${session.userId}&select=channel_id,role`);
	const roleByChannel = new Map((Array.isArray(memberRows) ? memberRows : []).map((row) => [row.channel_id, row.role]));
	const wsRows = await rest(config, deps.fetchImpl, `osionos_workspace_members?user_id=eq.${session.userId}&select=workspace_id`);
	const workspaceIds = (Array.isArray(wsRows) ? wsRows : []).map((row) => row.workspace_id).filter((id) => UUID_REGEX.test(String(id)));
	const channelIds = [...roleByChannel.keys()].filter((id) => UUID_REGEX.test(String(id)));
	const clauses = [];
	if (channelIds.length > 0) clauses.push(`id.in.(${channelIds.join(',')})`);
	if (workspaceIds.length > 0) clauses.push(`and(workspace_id.in.(${workspaceIds.join(',')}),is_private.eq.false,kind.neq.dm)`);
	if (clauses.length === 0) return sendJson(response, 200, { ok: true, channels: [] }, config);
	let path = `osionos_channels?or=(${clauses.join(',')})&select=*&order=created_at.asc`;
	if (UUID_REGEX.test(filterWs)) path += `&workspace_id=eq.${filterWs}`;
	const rows = await rest(config, deps.fetchImpl, path);
	const channels = (Array.isArray(rows) ? rows : []).map((row) => channelEntry(row, roleByChannel.get(row.id) ?? null));
	return sendJson(response, 200, { ok: true, channels }, config);
}

async function createChannel(deps, session, request, response, config) {
	const payload = await readJsonBody(request);
	const workspaceId = requireUuid(payload.workspaceId, 'workspaceId');
	const member = await workspaceMembership(config, deps.fetchImpl, session.userId, workspaceId);
	if (!member) throw httpError('You are not a member of this workspace.', 403);
	const kind = CHANNEL_KINDS.has(payload.kind) && payload.kind !== 'dm' ? payload.kind : 'text';
	const name = safeText(payload.name, 80);
	if (!name) throw httpError('Channel name is required.', 422);
	const rows = await rest(config, deps.fetchImpl, 'osionos_channels', {
		method: 'POST',
		body: {
			workspace_id: workspaceId,
			kind,
			name,
			topic: safeText(payload.topic, 200) || null,
			created_by: session.userId,
			is_private: payload.isPrivate === true,
		},
		prefer: 'return=representation',
	});
	const row = Array.isArray(rows) ? rows[0] : rows;
	if (!row) throw httpError('Channel creation failed.', 502);
	await rest(config, deps.fetchImpl, 'osionos_channel_members', {
		method: 'POST',
		body: { channel_id: row.id, user_id: session.userId, role: 'owner' },
		prefer: 'resolution=ignore-duplicates,return=minimal',
	});
	return sendJson(response, 201, { ok: true, channel: channelEntry(row, 'owner') }, config);
}

async function listMessages(deps, session, url, channelId, response, config) {
	const { channel } = await requireChannelAccess(config, deps.fetchImpl, session.userId, channelId);
	const limitRaw = Number(url.searchParams.get('limit'));
	const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), MAX_PAGE) : DEFAULT_PAGE;
	const before = safeText(url.searchParams.get('before'), 64);
	let path = `osionos_messages?channel_id=eq.${channel.id}&deleted_at=is.null&select=*&order=created_at.desc&limit=${limit}`;
	if (before && !Number.isNaN(Date.parse(before))) path += `&created_at=lt.${encodeURIComponent(new Date(before).toISOString())}`;
	const rows = await rest(config, deps.fetchImpl, path);
	const ordered = (Array.isArray(rows) ? rows : []).reverse();
	const messageIds = ordered.map((row) => row.id);
	let reactionsByMessage = new Map();
	if (messageIds.length > 0) {
		const reactionRows = await rest(config, deps.fetchImpl, `osionos_message_reactions?message_id=in.(${messageIds.join(',')})&select=message_id,user_id,emoji`);
		reactionsByMessage = Map.groupBy(Array.isArray(reactionRows) ? reactionRows : [], (row) => row.message_id);
	}
	const identities = await identitySummaries(config, deps.fetchImpl, ordered.map((row) => row.author_id));
	const messages = ordered.map((row) => messageEntry(
		row,
		identities.get(row.author_id),
		(reactionsByMessage.get(row.id) ?? []).map((r) => ({ userId: r.user_id, emoji: r.emoji })),
	));
	return sendJson(response, 200, { ok: true, channelId: channel.id, workspaceId: channel.workspace_id, messages }, config);
}

async function postMessage(deps, session, request, channelId, response, config) {
	const { channel } = await requireChannelAccess(config, deps.fetchImpl, session.userId, channelId);
	const payload = await readJsonBody(request, 64 * 1024);
	const content = safeText(payload.content, 8000);
	if (!content) throw httpError('Message content is required.', 422);
	const rows = await rest(config, deps.fetchImpl, 'osionos_messages', {
		method: 'POST',
		body: {
			channel_id: channel.id,
			author_id: session.userId,
			content,
			attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
		},
		prefer: 'return=representation',
	});
	const row = Array.isArray(rows) ? rows[0] : rows;
	if (!row) throw httpError('Message persistence failed.', 502);
	const identities = await identitySummaries(config, deps.fetchImpl, [session.userId]);
	const identity = identities.get(session.userId);
	await publishRealtime({
		topic: chatTopic(channel),
		eventType: 'message_created',
		payload: {
			messageId: row.id,
			channelId: channel.id,
			authorId: session.userId,
			authorName: identity?.name ?? 'Member',
			content: row.content,
			createdAt: row.created_at,
		},
		fetchImpl: deps.fetchImpl,
		env: deps.env,
	});
	return sendJson(response, 201, { ok: true, message: messageEntry(row, identity) }, config);
}

async function patchMessage(deps, session, request, messageId, response, config) {
	const existing = await fetchMessageForAuthor(config, deps.fetchImpl, session.userId, messageId);
	const payload = await readJsonBody(request, 64 * 1024);
	const content = safeText(payload.content, 8000);
	if (!content) throw httpError('Message content is required.', 422);
	const rows = await rest(config, deps.fetchImpl, `osionos_messages?id=eq.${messageId}`, {
		method: 'PATCH',
		body: { content, edited_at: new Date().toISOString() },
		prefer: 'return=representation',
	});
	const row = Array.isArray(rows) ? rows[0] : rows;
	const channel = await fetchChannel(config, deps.fetchImpl, existing.channel_id);
	await publishRealtime({
		topic: chatTopic(channel),
		eventType: 'message_updated',
		payload: { messageId, channelId: channel.id, authorId: session.userId, content, editedAt: row?.edited_at ?? null },
		fetchImpl: deps.fetchImpl,
		env: deps.env,
	});
	const identities = await identitySummaries(config, deps.fetchImpl, [session.userId]);
	return sendJson(response, 200, { ok: true, message: messageEntry(row ?? existing, identities.get(session.userId)) }, config);
}

async function deleteMessage(deps, session, messageId, response, config) {
	const existing = await fetchMessageForAuthor(config, deps.fetchImpl, session.userId, messageId);
	await rest(config, deps.fetchImpl, `osionos_messages?id=eq.${messageId}`, {
		method: 'PATCH',
		body: { deleted_at: new Date().toISOString() },
		prefer: 'return=minimal',
	});
	const channel = await fetchChannel(config, deps.fetchImpl, existing.channel_id);
	await publishRealtime({
		topic: chatTopic(channel),
		eventType: 'message_deleted',
		payload: { messageId, channelId: channel.id, authorId: session.userId },
		fetchImpl: deps.fetchImpl,
		env: deps.env,
	});
	return sendJson(response, 200, { ok: true, messageId, deleted: true }, config);
}

async function setReaction(deps, session, request, url, messageId, add, response, config) {
	const rows = await rest(config, deps.fetchImpl, `osionos_messages?id=eq.${messageId}&select=*&limit=1`);
	const message = Array.isArray(rows) ? rows[0] : null;
	if (!message || message.deleted_at) throw httpError('Message not found.', 404);
	const { channel } = await requireChannelAccess(config, deps.fetchImpl, session.userId, message.channel_id);
	const payload = add || !url.searchParams.get('emoji') ? await readJsonBody(request) : {};
	const emoji = safeText(payload.emoji ?? url.searchParams.get('emoji'), 32);
	if (!emoji) throw httpError('emoji is required.', 422);
	if (add) {
		await rest(config, deps.fetchImpl, 'osionos_message_reactions?on_conflict=message_id,user_id,emoji', {
			method: 'POST',
			body: { message_id: messageId, user_id: session.userId, emoji },
			prefer: 'resolution=ignore-duplicates,return=minimal',
		});
	} else {
		await rest(config, deps.fetchImpl, `osionos_message_reactions?message_id=eq.${messageId}&user_id=eq.${session.userId}&emoji=eq.${encodeURIComponent(emoji)}`, {
			method: 'DELETE',
			prefer: 'return=minimal',
		});
	}
	await publishRealtime({
		topic: chatTopic(channel),
		eventType: add ? 'reaction_added' : 'reaction_removed',
		payload: { messageId, channelId: channel.id, userId: session.userId, emoji },
		fetchImpl: deps.fetchImpl,
		env: deps.env,
	});
	return sendJson(response, 200, { ok: true, messageId, emoji, added: add }, config);
}

/** Find-or-create the 2-member DM channel (deterministic dm_key, race-safe). */
async function openDm(deps, session, request, response, config) {
	const payload = await readJsonBody(request);
	const peerUserId = requireUuid(payload.peerUserId, 'peerUserId');
	if (peerUserId === session.userId) throw httpError('Cannot open a DM with yourself.', 422);
	let workspaceId = UUID_REGEX.test(safeText(payload.workspaceId, 80)) ? payload.workspaceId : '';
	const pairRows = await rest(config, deps.fetchImpl, `osionos_workspace_members?user_id=in.(${session.userId},${peerUserId})&select=user_id,workspace_id`);
	const mine = new Set();
	const shared = [];
	for (const row of Array.isArray(pairRows) ? pairRows : []) {
		if (row.user_id === session.userId) mine.add(row.workspace_id);
	}
	for (const row of Array.isArray(pairRows) ? pairRows : []) {
		if (row.user_id === peerUserId && mine.has(row.workspace_id)) shared.push(row.workspace_id);
	}
	if (workspaceId && !shared.includes(workspaceId)) throw httpError('Both users must belong to the workspace.', 403);
	if (!workspaceId) workspaceId = shared[0] ?? '';
	if (!workspaceId) throw httpError('No shared workspace with this user.', 403);
	const identities = await identitySummaries(config, deps.fetchImpl, [session.userId, peerUserId]);
	const dmKey = `dm:${[session.userId, peerUserId].sort((a, b) => a.localeCompare(b)).join(':')}`;
	const name = `${identities.get(session.userId)?.name ?? 'Member'} & ${identities.get(peerUserId)?.name ?? 'Member'}`;
	await rest(config, deps.fetchImpl, 'osionos_channels?on_conflict=dm_key', {
		method: 'POST',
		body: { workspace_id: workspaceId, kind: 'dm', name, created_by: session.userId, is_private: true, dm_key: dmKey },
		prefer: 'resolution=ignore-duplicates,return=minimal',
	});
	const rows = await rest(config, deps.fetchImpl, `osionos_channels?dm_key=eq.${encodeURIComponent(dmKey)}&select=*&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row) throw httpError('DM channel creation failed.', 502);
	for (const userId of [session.userId, peerUserId]) {
		await rest(config, deps.fetchImpl, 'osionos_channel_members', {
			method: 'POST',
			body: { channel_id: row.id, user_id: userId, role: 'member' },
			prefer: 'resolution=ignore-duplicates,return=minimal',
		});
	}
	return sendJson(response, 200, { ok: true, channel: channelEntry(row, 'member'), peerUserId }, config);
}

/**
 * Build the /api/chat dispatcher: `await handler(url, request, response)` →
 * true when handled. deps: { config, verifySession, fetchImpl?, env? }.
 */
export function createChatHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
	return async function handleChatRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		if (!pathname.startsWith('/api/chat/')) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (pathname === '/api/chat/channels' && method === 'GET') return await listChannels(deps, session, url, response, requestConfig);
			if (pathname === '/api/chat/channels' && method === 'POST') return await createChannel(deps, session, request, response, requestConfig);
			if (pathname === '/api/chat/dm' && method === 'POST') return await openDm(deps, session, request, response, requestConfig);
			const channelMessages = /^\/api\/chat\/channels\/([0-9a-f-]{36})\/messages$/i.exec(pathname);
			if (channelMessages && method === 'GET') return await listMessages(deps, session, url, channelMessages[1], response, requestConfig);
			if (channelMessages && method === 'POST') return await postMessage(deps, session, request, channelMessages[1], response, requestConfig);
			const message = /^\/api\/chat\/messages\/([0-9a-f-]{36})$/i.exec(pathname);
			if (message && method === 'PATCH') return await patchMessage(deps, session, request, message[1], response, requestConfig);
			if (message && method === 'DELETE') return await deleteMessage(deps, session, message[1], response, requestConfig);
			const reactions = /^\/api\/chat\/messages\/([0-9a-f-]{36})\/reactions$/i.exec(pathname);
			if (reactions && method === 'POST') return await setReaction(deps, session, request, url, reactions[1], true, response, requestConfig);
			if (reactions && method === 'DELETE') return await setReaction(deps, session, request, url, reactions[1], false, response, requestConfig);
			return sendJson(response, 404, { ok: false, message: 'Chat route not found.' }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Chat request failed.' }, requestConfig);
		}
	};
}
