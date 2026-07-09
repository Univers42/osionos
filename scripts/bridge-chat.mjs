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
	emitNotifications,
	httpError,
	identitySummaries,
	parseMentions,
	publishRealtime,
	readJsonBody,
	requireUuid,
	rest,
	safeText,
	sendJson,
	workspaceMembership,
} from './bridge-social-core.mjs';
import {
	attachmentEntry,
	handleGallery,
	handleLinkPreview,
	handleServe,
	handleUpload,
	sanitizeAttachmentMetadata,
} from './bridge-chat-media.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { searchMessages } from './bridge-chat-search.mjs';
import { getThread } from './bridge-chat-threads.mjs';

const CHANNEL_KINDS = new Set(['text', 'dm', 'voice', 'video', 'group']);
const DEFAULT_PAGE = 50;
const MAX_PAGE = 100;
const MEMBER_ROLES = new Set(['owner', 'admin', 'member']);

function channelEntry(row, memberRole = null) {
	return {
		id: row.id,
		workspaceId: row.workspace_id,
		kind: row.kind,
		name: row.name,
		topic: row.topic ?? null,
		avatar: row.avatar ?? null,
		description: row.description ?? null,
		createdBy: row.created_by ?? null,
		isPrivate: row.is_private === true,
		memberRole,
		createdAt: row.created_at ?? null,
		updatedAt: row.updated_at ?? null,
	};
}

function messageEntry(row, identity, reactions = [], attachments = null, replyTo = null, mentions = []) {
	return {
		id: row.id,
		channelId: row.channel_id,
		authorId: row.author_id,
		authorName: identity?.name ?? 'Member',
		authorAvatar: identity?.avatar ?? null,
		content: row.deleted_at ? '' : row.content,
		attachments: Array.isArray(attachments) ? attachments : (Array.isArray(row.attachments) ? row.attachments : []),
		mentions: Array.isArray(mentions) ? mentions : [],
		replyTo: replyTo ?? null,
		threadRootId: row.thread_root_id ?? null,
		replyCount: row.reply_count ?? 0,
		createdAt: row.created_at,
		editedAt: row.edited_at ?? null,
		deletedAt: row.deleted_at ?? null,
		reactions,
	};
}

/** Compact quote of a replied-to message: who + a short content excerpt. */
function replyExcerpt(row, identity) {
	if (!row) return null;
	return { id: row.id, authorName: identity?.name ?? 'Member', content: row.deleted_at ? '' : safeText(row.content, 140) };
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

/** owner/admin gate on a channel — throws 403 otherwise. Returns {channel, role}. */
async function requireChannelAdmin(config, fetchImpl, userId, channelId) {
	const access = await requireChannelAccess(config, fetchImpl, userId, channelId);
	if (access.role !== 'owner' && access.role !== 'admin') {
		throw httpError('Only an owner or admin can do this.', 403);
	}
	return access;
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

/** The caller's accessible channel ids: member channels ∪ public workspace channels. */
async function accessibleChannelIds(deps, config, userId) {
	const memberRows = await rest(config, deps.fetchImpl, `osionos_channel_members?user_id=eq.${userId}&select=channel_id`);
	const ids = new Set((Array.isArray(memberRows) ? memberRows : []).map((r) => r.channel_id).filter((id) => UUID_REGEX.test(String(id))));
	const wsRows = await rest(config, deps.fetchImpl, `osionos_workspace_members?user_id=eq.${userId}&select=workspace_id`);
	const workspaceIds = (Array.isArray(wsRows) ? wsRows : []).map((r) => r.workspace_id).filter((id) => UUID_REGEX.test(String(id)));
	if (workspaceIds.length > 0) {
		const publicRows = await rest(config, deps.fetchImpl, `osionos_channels?workspace_id=in.(${workspaceIds.join(',')})&is_private=eq.false&kind=not.in.(dm,group)&select=id`);
		for (const r of Array.isArray(publicRows) ? publicRows : []) ids.add(r.id);
	}
	return [...ids];
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
	if (workspaceIds.length > 0) clauses.push(`and(workspace_id.in.(${workspaceIds.join(',')}),is_private.eq.false,kind.not.in.(dm,group))`);
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
	let attachmentsByMessage = new Map();
	let mentionsByMessage = new Map();
	if (messageIds.length > 0) {
		const reactionRows = await rest(config, deps.fetchImpl, `osionos_message_reactions?message_id=in.(${messageIds.join(',')})&select=message_id,user_id,emoji`);
		reactionsByMessage = Map.groupBy(Array.isArray(reactionRows) ? reactionRows : [], (row) => row.message_id);
		const attachRows = await rest(config, deps.fetchImpl, `osionos_message_attachments?message_id=in.(${messageIds.join(',')})&select=*&order=created_at.asc`);
		attachmentsByMessage = Map.groupBy(Array.isArray(attachRows) ? attachRows : [], (row) => row.message_id);
		const mentionRows = await rest(config, deps.fetchImpl, `osionos_message_mentions?message_id=in.(${messageIds.join(',')})&select=message_id,user_id`);
		mentionsByMessage = Map.groupBy(Array.isArray(mentionRows) ? mentionRows : [], (row) => row.message_id);
	}
	const identities = await identitySummaries(config, deps.fetchImpl, ordered.map((row) => row.author_id));
	const replyIds = [...new Set(ordered.map((row) => row.reply_to_id).filter((id) => id && UUID_REGEX.test(String(id))))];
	let replyById = new Map();
	if (replyIds.length > 0) {
		const replyRows = await rest(config, deps.fetchImpl, `osionos_messages?id=in.(${replyIds.join(',')})&select=id,author_id,content,deleted_at`);
		const replyIdentities = await identitySummaries(config, deps.fetchImpl, (Array.isArray(replyRows) ? replyRows : []).map((r) => r.author_id));
		replyById = new Map((Array.isArray(replyRows) ? replyRows : []).map((r) => [r.id, replyExcerpt(r, replyIdentities.get(r.author_id))]));
	}
	const messages = ordered.map((row) => messageEntry(
		row,
		identities.get(row.author_id),
		(reactionsByMessage.get(row.id) ?? []).map((r) => ({ userId: r.user_id, emoji: r.emoji })),
		attachmentsByMessage.has(row.id) ? (attachmentsByMessage.get(row.id) ?? []).map(attachmentEntry) : null,
		row.reply_to_id ? replyById.get(row.reply_to_id) ?? null : null,
		(mentionsByMessage.get(row.id) ?? []).map((r) => r.user_id),
	));
	return sendJson(response, 200, { ok: true, channelId: channel.id, workspaceId: channel.workspace_id, messages }, config);
}

/**
 * Persist each attachment descriptor into osionos_message_attachments and
 * return the resolved client attachments (url → /api/chat/uploads/:rowId).
 * Drafts come from POST /api/chat/uploads (objectKey/sha256) or are type=url.
 */
async function fanOutAttachments(deps, config, message, channel, drafts) {
	const valid = [];
	for (const draft of Array.isArray(drafts) ? drafts.slice(0, 20) : []) {
		if (!draft || typeof draft !== 'object') continue;
		const type = ['image', 'video', 'audio', 'file', 'url'].includes(draft.type) ? draft.type : 'file';
		const isUrl = type === 'url';
		const objectKey = isUrl ? null : safeText(draft.objectKey, 200) || null;
		const externalUrl = isUrl ? safeText(draft.url, 2048) || null : null;
		if (!objectKey && !externalUrl) continue;
		const metadata = sanitizeAttachmentMetadata(draft.metadata);
		valid.push({
			message_id: message.id, channel_id: channel.id, owner_id: message.author_id, type,
			bucket: 'chat', object_key: objectKey, sha256: isUrl ? null : (safeText(draft.sha256, 80) || null),
			url: externalUrl, display_name: safeText(draft.name, 200) || '',
			size: Number.isFinite(Number(draft.size)) ? Math.trunc(Number(draft.size)) : 0,
			content_type: safeText(draft.mimeType, 160) || 'application/octet-stream', metadata,
		});
	}
	if (valid.length === 0) return [];
	const rows = await rest(config, deps.fetchImpl, 'osionos_message_attachments', { method: 'POST', body: valid, prefer: 'return=representation' });
	return (Array.isArray(rows) ? rows : []).map(attachmentEntry);
}

/** Resolve @handles in `content` to channel-member user ids (≤10, excludes self). */
async function resolveMentions(deps, config, channelId, content, selfId) {
	const handles = parseMentions(content);
	if (handles.length === 0) return [];
	const idents = await rest(config, deps.fetchImpl, `osionos_bridge_identities?username=in.(${handles.map(encodeURIComponent).join(',')})&select=user_id,username`);
	const candidates = [...new Set((Array.isArray(idents) ? idents : []).map((r) => r.user_id).filter((id) => UUID_REGEX.test(String(id)) && id !== selfId))];
	if (candidates.length === 0) return [];
	const members = await rest(config, deps.fetchImpl, `osionos_channel_members?channel_id=eq.${channelId}&user_id=in.(${candidates.join(',')})&select=user_id`);
	return [...new Set((Array.isArray(members) ? members : []).map((r) => r.user_id))].slice(0, 10);
}

async function postMessage(deps, session, request, channelId, response, config) {
	const { channel } = await requireChannelAccess(config, deps.fetchImpl, session.userId, channelId);
	takeToken(`msg:${session.userId}`, { capacity: 20, refillPerSec: 5 });
	const payload = await readJsonBody(request, 64 * 1024);
	const content = safeText(payload.content, 8000);
	const drafts = Array.isArray(payload.attachments) ? payload.attachments : [];
	if (!content && drafts.length === 0) throw httpError('Message content or an attachment is required.', 422);
	const replyToId = payload.replyTo && UUID_REGEX.test(String(payload.replyTo)) ? String(payload.replyTo) : null;
	let replyTo = null;
	let replyAuthorId = null;
	let threadRootId = null;
	if (replyToId) {
		const replyRows = await rest(config, deps.fetchImpl, `osionos_messages?id=eq.${replyToId}&channel_id=eq.${channel.id}&deleted_at=is.null&select=id,author_id,content,deleted_at,thread_root_id&limit=1`);
		const replyRow = Array.isArray(replyRows) ? replyRows[0] : null;
		if (replyRow) {
			replyAuthorId = replyRow.author_id;
			threadRootId = replyRow.thread_root_id ?? replyRow.id;
			const replyIdent = await identitySummaries(config, deps.fetchImpl, [replyRow.author_id]);
			replyTo = replyExcerpt(replyRow, replyIdent.get(replyRow.author_id));
		}
	}
	const rows = await rest(config, deps.fetchImpl, 'osionos_messages', {
		method: 'POST',
		body: { channel_id: channel.id, author_id: session.userId, content, attachments: [], reply_to_id: replyTo ? replyToId : null, thread_root_id: threadRootId },
		prefer: 'return=representation',
	});
	const row = Array.isArray(rows) ? rows[0] : rows;
	if (!row) throw httpError('Message persistence failed.', 502);
	const attachments = await fanOutAttachments(deps, config, row, channel, drafts);
	if (attachments.length > 0) {
		await rest(config, deps.fetchImpl, `osionos_messages?id=eq.${row.id}`, { method: 'PATCH', body: { attachments }, prefer: 'return=minimal' });
	}
	const mentions = await resolveMentions(deps, config, channel.id, content, session.userId);
	if (mentions.length > 0) {
		await rest(config, deps.fetchImpl, 'osionos_message_mentions?on_conflict=message_id,user_id', {
			method: 'POST',
			body: mentions.map((uid) => ({ message_id: row.id, user_id: uid, channel_id: channel.id })),
			prefer: 'resolution=ignore-duplicates,return=minimal',
		});
	}
	const identities = await identitySummaries(config, deps.fetchImpl, [session.userId]);
	const identity = identities.get(session.userId);
	// Fan out notifications (best-effort, non-blocking): mentions, then a reply
	// to the quoted author, then DM delivery to the other member — deduped.
	const actorName = identity?.name ?? 'Member';
	const preview = content.slice(0, 140);
	const seen = new Set([session.userId]);
	const notifs = [];
	for (const uid of mentions) {
		if (seen.has(uid)) continue;
		seen.add(uid);
		notifs.push({ recipientId: uid, type: 'mention', actorId: session.userId, actorName, channelId: channel.id, messageId: row.id, preview });
	}
	if (replyAuthorId && !seen.has(replyAuthorId)) {
		seen.add(replyAuthorId);
		notifs.push({ recipientId: replyAuthorId, type: 'reply', actorId: session.userId, actorName, channelId: channel.id, messageId: row.id, preview });
	}
	if (channel.kind === 'dm') {
		const others = await rest(config, deps.fetchImpl, `osionos_channel_members?channel_id=eq.${channel.id}&user_id=neq.${session.userId}&select=user_id`);
		for (const r of Array.isArray(others) ? others : []) {
			if (seen.has(r.user_id)) continue;
			seen.add(r.user_id);
			notifs.push({ recipientId: r.user_id, type: 'dm', actorId: session.userId, actorName, channelId: channel.id, messageId: row.id, preview });
		}
	}
	if (notifs.length > 0) void emitNotifications(deps, config, notifs).catch(() => undefined);
	// Mirror the client Attachment shape: width/height/durationMs/waveform live
	// under `metadata` (the editor reads attachment.metadata.*). Flattening them
	// here froze voice-message playback progress for anyone rendering this live
	// frame — the receiver always, and the sender when the WS echo beat the POST
	// response (applyChatEvent de-dupes by id, so the first arrival wins).
	const compact = attachments.map((a) => ({ id: a.id, type: a.type, url: a.url, name: a.name, mimeType: a.mimeType, size: a.size, metadata: a.metadata }));
	const framePayload = {
		messageId: row.id, channelId: channel.id, authorId: session.userId,
		authorName: identity?.name ?? 'Member', authorAvatar: identity?.avatar ?? null,
		content: row.content, createdAt: row.created_at, attachments: compact, replyTo, mentions, threadRootId,
	};
	if (JSON.stringify(framePayload).length > 60_000) framePayload.attachments = [];
	await publishRealtime({ topic: chatTopic(channel), eventType: 'message_created', payload: framePayload, fetchImpl: deps.fetchImpl, env: deps.env });
	return sendJson(response, 201, { ok: true, message: messageEntry(row, identity, [], attachments, replyTo, mentions) }, config);
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
	takeToken(`react:${session.userId}`, { capacity: 30, refillPerSec: 10 });
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

/**
 * Find-or-create the 2-member DM channel (deterministic dm_key, race-safe).
 * Shared by the /api/chat/dm handler AND feed share-to-DM (bridge-feed) so the
 * DM find-or-create logic lives in exactly one place.
 */
export async function ensureDmChannel(deps, session, config, peerUserId, workspaceHint = '') {
	if (peerUserId === session.userId) throw httpError('Cannot open a DM with yourself.', 422);
	const blockRows = await rest(config, deps.fetchImpl, `osionos_user_blocks?or=(and(blocker_id.eq.${session.userId},blocked_id.eq.${peerUserId}),and(blocker_id.eq.${peerUserId},blocked_id.eq.${session.userId}))&select=blocker_id&limit=1`);
	if (Array.isArray(blockRows) && blockRows.length > 0) throw httpError('You cannot message this person.', 403);
	let workspaceId = UUID_REGEX.test(safeText(workspaceHint, 80)) ? workspaceHint : '';
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
	// DM access is gated by osionos_channel_members (both users are added below), NOT by
	// workspace membership — the workspace is only a container. Prefer a shared workspace;
	// otherwise fall back to the requester's own so you can DM ANY peer (chat is open to
	// anyone by design — a connection/shared-workspace is never required to message).
	if (!workspaceId) workspaceId = shared[0] ?? (Array.isArray(session.workspaceIds) ? session.workspaceIds[0] : '') ?? '';
	if (!workspaceId) throw httpError('Could not resolve a workspace for this DM.', 500);
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
	return row;
}

async function openDm(deps, session, request, response, config) {
	const payload = await readJsonBody(request);
	const peerUserId = requireUuid(payload.peerUserId, 'peerUserId');
	const row = await ensureDmChannel(deps, session, config, peerUserId, safeText(payload.workspaceId, 80));
	return sendJson(response, 200, { ok: true, channel: channelEntry(row, 'member'), peerUserId }, config);
}

/**
 * Deliver `content` into the DM with `peerUserId` (feed share-to-DM). Reuses the
 * exact DM channel + message insert + "messaged you" notification + realtime
 * frame the normal chat path uses, so a shared post lands as a live DM.
 */
export async function shareToDmChannel(deps, session, config, peerUserId, content) {
	const channel = await ensureDmChannel(deps, session, config, peerUserId);
	const rows = await rest(config, deps.fetchImpl, 'osionos_messages', {
		method: 'POST',
		body: { channel_id: channel.id, author_id: session.userId, content: safeText(content, 8000), attachments: [] },
		prefer: 'return=representation',
	});
	const row = Array.isArray(rows) ? rows[0] : rows;
	if (!row) throw httpError('Share message delivery failed.', 502);
	const identity = (await identitySummaries(config, deps.fetchImpl, [session.userId])).get(session.userId);
	const actorName = identity?.name ?? 'Member';
	void emitNotifications(deps, config, [{ recipientId: peerUserId, type: 'dm', actorId: session.userId, actorName, channelId: channel.id, messageId: row.id, preview: safeText(content, 140) }]).catch(() => undefined);
	await publishRealtime({
		topic: chatTopic(channel),
		eventType: 'message_created',
		payload: { messageId: row.id, channelId: channel.id, authorId: session.userId, authorName: actorName, authorAvatar: identity?.avatar ?? null, content: row.content, createdAt: row.created_at, attachments: [], replyTo: null, mentions: [], threadRootId: null },
		fetchImpl: deps.fetchImpl,
		env: deps.env,
	});
	return { channelId: channel.id, messageId: row.id };
}

/** POST /api/chat/groups — create a group channel + seed members. */
async function createGroup(deps, session, request, response, config) {
	const payload = await readJsonBody(request, 32 * 1024);
	const name = safeText(payload.name, 80);
	if (!name) throw httpError('Group name is required.', 422);
	let workspaceId = UUID_REGEX.test(safeText(payload.workspaceId, 80)) ? payload.workspaceId : '';
	if (!workspaceId) {
		const wsRows = await rest(config, deps.fetchImpl, `osionos_workspace_members?user_id=eq.${session.userId}&select=workspace_id&limit=1`);
		workspaceId = (Array.isArray(wsRows) ? wsRows[0]?.workspace_id : '') ?? '';
	}
	if (!UUID_REGEX.test(workspaceId)) throw httpError('A workspace is required.', 422);
	if (!(await workspaceMembership(config, deps.fetchImpl, session.userId, workspaceId))) throw httpError('You are not a member of this workspace.', 403);
	const rows = await rest(config, deps.fetchImpl, 'osionos_channels', {
		method: 'POST',
		body: {
			workspace_id: workspaceId,
			kind: 'group',
			name,
			created_by: session.userId,
			is_private: true,
			avatar: safeText(payload.avatar, 1024) || null,
			description: safeText(payload.description, 500) || null,
		},
		prefer: 'return=representation',
	});
	const row = Array.isArray(rows) ? rows[0] : rows;
	if (!row) throw httpError('Group creation failed.', 502);
	const memberIds = [...new Set((Array.isArray(payload.memberIds) ? payload.memberIds : []).filter((id) => UUID_REGEX.test(String(id)) && id !== session.userId))];
	const memberRows = [{ channel_id: row.id, user_id: session.userId, role: 'owner' }, ...memberIds.map((id) => ({ channel_id: row.id, user_id: id, role: 'member' }))];
	await rest(config, deps.fetchImpl, 'osionos_channel_members?on_conflict=channel_id,user_id', {
		method: 'POST',
		body: memberRows,
		prefer: 'resolution=ignore-duplicates,return=minimal',
	});
	return sendJson(response, 201, { ok: true, channel: channelEntry(row, 'owner') }, config);
}

/** PATCH /api/chat/channels/:id — owner/admin metadata edit. */
async function patchChannel(deps, session, request, channelId, response, config) {
	await requireChannelAdmin(config, deps.fetchImpl, session.userId, channelId);
	const payload = await readJsonBody(request);
	const update = { updated_at: new Date().toISOString() };
	if (Object.hasOwn(payload, 'name')) update.name = safeText(payload.name, 80) || 'Channel';
	if (Object.hasOwn(payload, 'avatar')) update.avatar = safeText(payload.avatar, 1024) || null;
	if (Object.hasOwn(payload, 'description')) update.description = safeText(payload.description, 500) || null;
	if (Object.hasOwn(payload, 'topic')) update.topic = safeText(payload.topic, 200) || null;
	const rows = await rest(config, deps.fetchImpl, `osionos_channels?id=eq.${channelId}`, { method: 'PATCH', body: update, prefer: 'return=representation' });
	const row = Array.isArray(rows) ? rows[0] : rows;
	return sendJson(response, 200, { ok: true, channel: channelEntry(row ?? { id: channelId }) }, config);
}

/** POST /api/chat/channels/:id/members — owner/admin adds members. */
async function addMembers(deps, session, request, channelId, response, config) {
	await requireChannelAdmin(config, deps.fetchImpl, session.userId, channelId);
	const payload = await readJsonBody(request);
	const userIds = [...new Set((Array.isArray(payload.userIds) ? payload.userIds : []).filter((id) => UUID_REGEX.test(String(id))))];
	if (userIds.length === 0) throw httpError('userIds is required.', 422);
	await rest(config, deps.fetchImpl, 'osionos_channel_members?on_conflict=channel_id,user_id', {
		method: 'POST',
		body: userIds.map((id) => ({ channel_id: channelId, user_id: id, role: 'member' })),
		prefer: 'resolution=ignore-duplicates,return=minimal',
	});
	return sendJson(response, 200, { ok: true, channelId, added: userIds.length }, config);
}

/** DELETE /api/chat/channels/:id/members/:userId — admin removes, or self-leave. */
async function removeMember(deps, session, channelId, targetUserId, response, config) {
	if (targetUserId !== session.userId) await requireChannelAdmin(config, deps.fetchImpl, session.userId, channelId);
	else await requireChannelAccess(config, deps.fetchImpl, session.userId, channelId);
	await rest(config, deps.fetchImpl, `osionos_channel_members?channel_id=eq.${channelId}&user_id=eq.${targetUserId}`, { method: 'DELETE', prefer: 'return=minimal' });
	return sendJson(response, 200, { ok: true, channelId, userId: targetUserId, removed: true }, config);
}

/** PATCH /api/chat/channels/:id/members/:userId {role} — owner promotes/demotes. */
async function setMemberRole(deps, session, request, channelId, targetUserId, response, config) {
	const access = await requireChannelAccess(config, deps.fetchImpl, session.userId, channelId);
	if (access.role !== 'owner') throw httpError('Only the owner can change roles.', 403);
	const payload = await readJsonBody(request);
	const role = safeText(payload.role, 16);
	if (!MEMBER_ROLES.has(role)) throw httpError('role must be owner|admin|member.', 422);
	await rest(config, deps.fetchImpl, `osionos_channel_members?channel_id=eq.${channelId}&user_id=eq.${targetUserId}`, {
		method: 'PATCH',
		body: { role },
		prefer: 'return=minimal',
	});
	return sendJson(response, 200, { ok: true, channelId, userId: targetUserId, role }, config);
}

/** POST /api/chat/channels/:id/receipts — bulk upsert read/delivered up to a message. */
async function postReceipts(deps, session, request, channelId, response, config) {
	let channel;
	try {
		({ channel } = await requireChannelAccess(config, deps.fetchImpl, session.userId, channelId));
	} catch {
		// Receipts are a best-effort signal: a non-member viewer (e.g. a public channel
		// they haven't joined) is a quiet no-op, not a hard 404 in the console.
		return sendJson(response, 200, { ok: true, count: 0 }, config);
	}
	const payload = await readJsonBody(request);
	const upToMessageId = requireUuid(payload.upToMessageId, 'upToMessageId');
	const status = safeText(payload.status, 16) === 'delivered' ? 'delivered' : 'seen';
	const upRows = await rest(config, deps.fetchImpl, `osionos_messages?id=eq.${upToMessageId}&channel_id=eq.${channel.id}&select=created_at&limit=1`);
	const upTo = Array.isArray(upRows) ? upRows[0]?.created_at : null;
	// Receipts are a best-effort, idempotent high-water signal. A client can mark
	// "seen up to" a message that isn't visible to this request yet (realtime echo
	// racing the insert, or an optimistic id) — that's a no-op, not a hard 404.
	if (!upTo) return sendJson(response, 200, { ok: true, count: 0 }, config);
	const msgRows = await rest(config, deps.fetchImpl, `osionos_messages?channel_id=eq.${channel.id}&created_at=lte.${encodeURIComponent(upTo)}&deleted_at=is.null&select=id`);
	const now = new Date().toISOString();
	const receipts = (Array.isArray(msgRows) ? msgRows : []).map((row) => ({
		message_id: row.id,
		user_id: session.userId,
		status,
		delivered_at: now,
		seen_at: status === 'seen' ? now : null,
	}));
	if (receipts.length > 0) {
		await rest(config, deps.fetchImpl, 'osionos_message_receipts?on_conflict=message_id,user_id', {
			method: 'POST',
			body: receipts,
			prefer: 'resolution=merge-duplicates,return=minimal',
		});
	}
	await publishRealtime({
		topic: chatTopic(channel),
		eventType: 'receipt_updated',
		payload: { channelId: channel.id, userId: session.userId, upToMessageId, status },
		fetchImpl: deps.fetchImpl,
		env: deps.env,
	});
	return sendJson(response, 200, { ok: true, count: receipts.length }, config);
}

/** GET /api/chat/messages/:id/receipts — list receipts (channel member only). */
async function listReceipts(deps, session, messageId, response, config) {
	const msgRows = await rest(config, deps.fetchImpl, `osionos_messages?id=eq.${messageId}&select=channel_id&limit=1`);
	const message = Array.isArray(msgRows) ? msgRows[0] : null;
	if (!message) throw httpError('Message not found.', 404);
	await requireChannelAccess(config, deps.fetchImpl, session.userId, message.channel_id);
	const rows = await rest(config, deps.fetchImpl, `osionos_message_receipts?message_id=eq.${messageId}&select=user_id,status,delivered_at,seen_at`);
	const receipts = (Array.isArray(rows) ? rows : []).map((row) => ({ userId: row.user_id, status: row.status, deliveredAt: row.delivered_at ?? null, seenAt: row.seen_at ?? null }));
	return sendJson(response, 200, { ok: true, messageId, receipts }, config);
}

/** POST /api/chat/channels/:id/typing — ephemeral, realtime-only (no DB write). */
async function postTyping(deps, session, channelId, response, config) {
	const { channel } = await requireChannelAccess(config, deps.fetchImpl, session.userId, channelId);
	await publishRealtime({
		topic: chatTopic(channel),
		eventType: 'typing',
		payload: { channelId: channel.id, userId: session.userId },
		fetchImpl: deps.fetchImpl,
		env: deps.env,
	});
	return sendJson(response, 200, { ok: true }, config);
}

/** GET /api/chat/unread — per-channel unread counts for the caller (RPC). */
async function getUnread(deps, session, response, config) {
	const rows = await rest(config, deps.fetchImpl, 'rpc/osionos_unread_counts', {
		method: 'POST',
		body: { p_user: session.userId },
		prefer: 'return=representation',
	});
	const counts = {};
	let total = 0;
	for (const row of Array.isArray(rows) ? rows : []) {
		const n = Number(row.unread) || 0;
		if (n > 0) { counts[row.channel_id] = n; total += n; }
	}
	return sendJson(response, 200, { ok: true, counts, total }, config);
}

/** POST /api/chat/channels/:id/read — advance the caller's read high-water mark. */
async function markChannelRead(deps, session, request, channelId, response, config) {
	await requireChannelAccess(config, deps.fetchImpl, session.userId, channelId);
	const payload = await readJsonBody(request).catch(() => ({}));
	const upToMessageId = UUID_REGEX.test(String(payload?.upToMessageId)) ? payload.upToMessageId : null;
	await rest(config, deps.fetchImpl, 'osionos_channel_reads?on_conflict=user_id,channel_id', {
		method: 'POST',
		body: { user_id: session.userId, channel_id: channelId, last_read_at: new Date().toISOString(), last_read_message_id: upToMessageId },
		prefer: 'resolution=merge-duplicates,return=minimal',
	});
	return sendJson(response, 200, { ok: true }, config);
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
			if (pathname === '/api/chat/uploads' && method === 'POST') return await handleUpload(deps, session, url, request, response, requestConfig, requireChannelAccess);
			const uploadOne = /^\/api\/chat\/uploads\/([0-9a-f-]{36})$/i.exec(pathname);
			if (uploadOne && method === 'GET') return await handleServe(deps, session, requireUuid(uploadOne[1], 'attachmentId'), request, response, requestConfig, requireChannelAccess);
			if (pathname === '/api/chat/link-preview' && method === 'POST') return await handleLinkPreview(deps, session, await readJsonBody(request), response, requestConfig);
			const channelMedia = /^\/api\/chat\/channels\/([0-9a-f-]{36})\/media$/i.exec(pathname);
			if (channelMedia && method === 'GET') return await handleGallery(deps, session, url, requireUuid(channelMedia[1], 'channelId'), response, requestConfig, requireChannelAccess);
			if (pathname === '/api/chat/channels' && method === 'GET') return await listChannels(deps, session, url, response, requestConfig);
			if (pathname === '/api/chat/channels' && method === 'POST') return await createChannel(deps, session, request, response, requestConfig);
			if (pathname === '/api/chat/groups' && method === 'POST') return await createGroup(deps, session, request, response, requestConfig);
			if (pathname === '/api/chat/dm' && method === 'POST') return await openDm(deps, session, request, response, requestConfig);
			if (pathname === '/api/chat/unread' && method === 'GET') return await getUnread(deps, session, response, requestConfig);
			if (pathname === '/api/chat/search' && method === 'GET') return await searchMessages(deps, session, url, response, requestConfig, { accessibleChannelIds, requireChannelAccess });
			const thread = /^\/api\/chat\/threads\/([0-9a-f-]{36})$/i.exec(pathname);
			if (thread && method === 'GET') return await getThread(deps, session, requireUuid(thread[1], 'rootId'), response, requestConfig, { requireChannelAccess, messageEntry });
			const channelMessages = /^\/api\/chat\/channels\/([0-9a-f-]{36})\/messages$/i.exec(pathname);
			if (channelMessages && method === 'GET') return await listMessages(deps, session, url, channelMessages[1], response, requestConfig);
			if (channelMessages && method === 'POST') return await postMessage(deps, session, request, channelMessages[1], response, requestConfig);
			const channelMembersOne = /^\/api\/chat\/channels\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})$/i.exec(pathname);
			if (channelMembersOne && method === 'DELETE') return await removeMember(deps, session, requireUuid(channelMembersOne[1], 'channelId'), requireUuid(channelMembersOne[2], 'userId'), response, requestConfig);
			if (channelMembersOne && method === 'PATCH') return await setMemberRole(deps, session, request, requireUuid(channelMembersOne[1], 'channelId'), requireUuid(channelMembersOne[2], 'userId'), response, requestConfig);
			const channelMembers = /^\/api\/chat\/channels\/([0-9a-f-]{36})\/members$/i.exec(pathname);
			if (channelMembers && method === 'POST') return await addMembers(deps, session, request, requireUuid(channelMembers[1], 'channelId'), response, requestConfig);
			const channelReceipts = /^\/api\/chat\/channels\/([0-9a-f-]{36})\/receipts$/i.exec(pathname);
			if (channelReceipts && method === 'POST') return await postReceipts(deps, session, request, requireUuid(channelReceipts[1], 'channelId'), response, requestConfig);
			const channelTyping = /^\/api\/chat\/channels\/([0-9a-f-]{36})\/typing$/i.exec(pathname);
			if (channelTyping && method === 'POST') return await postTyping(deps, session, requireUuid(channelTyping[1], 'channelId'), response, requestConfig);
			const channelRead = /^\/api\/chat\/channels\/([0-9a-f-]{36})\/read$/i.exec(pathname);
			if (channelRead && method === 'POST') return await markChannelRead(deps, session, request, requireUuid(channelRead[1], 'channelId'), response, requestConfig);
			const channelOne = /^\/api\/chat\/channels\/([0-9a-f-]{36})$/i.exec(pathname);
			if (channelOne && method === 'PATCH') return await patchChannel(deps, session, request, requireUuid(channelOne[1], 'channelId'), response, requestConfig);
			const messageReceipts = /^\/api\/chat\/messages\/([0-9a-f-]{36})\/receipts$/i.exec(pathname);
			if (messageReceipts && method === 'GET') return await listReceipts(deps, session, requireUuid(messageReceipts[1], 'messageId'), response, requestConfig);
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
