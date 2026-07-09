/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-feed.mjs                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Feed engagement (likes + multi-emoji reactions + threaded comments + sharing)
 * for the osionos social feed — standalone module in the bridge-rtc style
 * (bridge-api.mjs injects `config` + `verifySession`). Storage is the canonical
 * BaaS PostgREST tables from models/osionos-chat-migration.sql +
 * osionos-feed-engagement-migration.sql; every write goes through the
 * service-role bridge and forces the write user to the verified session.
 *
 * Routes (pageId must be a UUID — feed cards backed by non-UUID synthetic ids
 * get a 422 and the client treats the feature as absent):
 *   GET    /api/feed/:pageId/likes                 {count, likedByMe}
 *   POST   /api/feed/:pageId/like                  idempotent like
 *   DELETE /api/feed/:pageId/like                  remove my like
 *   GET    /api/feed/:pageId/reactions             {reactions:[{emoji,count,mine}]}
 *   POST   /api/feed/:pageId/reactions   {emoji}   idempotent; ≤20 distinct/post
 *   DELETE /api/feed/:pageId/reactions   {emoji}   remove my emoji
 *   GET    /api/feed/:pageId/comments              {comments:[…]} oldest→newest
 *   POST   /api/feed/:pageId/comments    {content,parentId?}  201 created comment
 *   PUT    /api/feed/:pageId/comments/:commentId   {content}   own only
 *   DELETE /api/feed/:pageId/comments/:commentId               own only (cascade)
 *   POST   /api/feed/:pageId/share       {target,dmUserId?}    {ok,count,link}
 *   GET    /api/feed/:pageId/share                 {count}
 *
 * After a mutation the module publishes (best-effort) on `feed:<workspaceId>` —
 * workspace resolved from osionos_pages when the page exists there, else
 * OSIONOS_ORG_WORKSPACE_ID, else the session's workspace.
 */

import {
	UUID_REGEX,
	bearerToken,
	emitNotifications,
	httpError,
	identitySummaries,
	orgWorkspaceId,
	publishRealtime,
	readJsonBody,
	requireUuid,
	rest,
	safeText,
	sendJson,
} from './bridge-social-core.mjs';
import { shareToDmChannel } from './bridge-chat.mjs';

const MAX_DISTINCT_REACTIONS = 20;
const SHARE_TARGETS = new Set(['profile', 'link', 'dm']);

async function feedWorkspaceId(deps, config, session, pageId) {
	try {
		const rows = await rest(config, deps.fetchImpl, `osionos_pages?id=eq.${pageId}&select=workspace_id&limit=1`);
		const mapped = Array.isArray(rows) ? rows[0]?.workspace_id : undefined;
		if (typeof mapped === 'string' && mapped) return mapped;
	} catch {
		// page lives outside osionos_pages (live database rows) — fall through
	}
	return orgWorkspaceId(deps.env) || session.workspaceIds?.[0] || 'unknown';
}

async function publishFeedEvent(deps, config, session, pageId, kind) {
	const workspaceId = await feedWorkspaceId(deps, config, session, pageId);
	await publishRealtime({
		topic: `feed:${workspaceId}`,
		eventType: `feed_${kind}`,
		payload: { pageId, kind, userId: session.userId },
		fetchImpl: deps.fetchImpl,
		env: deps.env,
	});
}

/**
 * Best-effort "someone engaged with your post" notification to the page owner —
 * reuses the shared osionos_notifications inbox + realtime toast (emitNotifications).
 * Skips self-engagement and pages with no resolvable owner (e.g. live-DB rows).
 */
async function notifyFeedOwner(deps, config, session, pageId, type, preview) {
	try {
		const rows = await rest(config, deps.fetchImpl, `osionos_pages?id=eq.${pageId}&select=owner_id&limit=1`);
		const ownerId = Array.isArray(rows) ? rows[0]?.owner_id : null;
		if (!ownerId || ownerId === session.userId) return;
		const identities = await identitySummaries(config, deps.fetchImpl, [session.userId]);
		const actorName = identities.get(session.userId)?.name ?? 'Someone';
		await emitNotifications(deps, config, [{ recipientId: ownerId, type, actorId: session.userId, actorName, preview }]);
	} catch { /* engagement must never fail on a notification hiccup */ }
}

/** Contract comment shape shared by list/create/update responses. */
function commentEntry(row, identities) {
	return {
		id: row.id,
		pageId: row.page_id,
		authorId: row.author_id,
		authorName: identities.get(row.author_id)?.name ?? 'Member',
		authorAvatar: identities.get(row.author_id)?.avatar ?? null,
		content: row.content,
		createdAt: row.created_at,
		updatedAt: row.updated_at ?? row.created_at,
		parentId: row.parent_id ?? null,
	};
}

async function getLikes(deps, session, pageId, response, config) {
	const rows = await rest(config, deps.fetchImpl, `osionos_feed_likes?page_id=eq.${pageId}&select=user_id`);
	const likes = Array.isArray(rows) ? rows : [];
	return sendJson(response, 200, {
		ok: true,
		pageId,
		count: likes.length,
		likedByMe: likes.some((row) => row.user_id === session.userId),
	}, config);
}

async function setLike(deps, session, pageId, add, response, config) {
	if (add) {
		await rest(config, deps.fetchImpl, 'osionos_feed_likes?on_conflict=page_id,user_id', {
			method: 'POST',
			body: { page_id: pageId, user_id: session.userId },
			prefer: 'resolution=ignore-duplicates,return=minimal',
		});
		await publishFeedEvent(deps, config, session, pageId, 'like');
	} else {
		await rest(config, deps.fetchImpl, `osionos_feed_likes?page_id=eq.${pageId}&user_id=eq.${session.userId}`, {
			method: 'DELETE',
			prefer: 'return=minimal',
		});
	}
	return getLikes(deps, session, pageId, response, config);
}

/** GET reactions: aggregate by emoji, ordered first-added (MIN(created_at) asc). */
async function getReactions(deps, session, pageId, response, config) {
	const rows = await rest(config, deps.fetchImpl, `osionos_feed_reactions?page_id=eq.${pageId}&select=user_id,emoji,created_at&order=created_at.asc`);
	// Comment count rides along on this one mount probe (no extra frontend request)
	// so the card shows "💬 N" before the thread is expanded.
	// ponytail: select=id + array length; swap to a Prefer:count=exact HEAD if a
	// single post's comment volume ever gets large enough to matter.
	const commentRows = await rest(config, deps.fetchImpl, `osionos_feed_comments?page_id=eq.${pageId}&select=id`);
	// rows arrive created_at ascending → a Map keeps first-seen (earliest) order.
	const byEmoji = new Map();
	for (const row of Array.isArray(rows) ? rows : []) {
		let entry = byEmoji.get(row.emoji);
		if (!entry) { entry = { emoji: row.emoji, count: 0, mine: false }; byEmoji.set(row.emoji, entry); }
		entry.count += 1;
		if (row.user_id === session.userId) entry.mine = true;
	}
	const commentCount = Array.isArray(commentRows) ? commentRows.length : 0;
	// The realtime workspace this page's feed events publish to — authoritative,
	// because the client can't derive it: real pages use their own workspace,
	// demo/live-DB rows fall to the org workspace. The feed socket subscribes to
	// exactly `feed:<workspaceId>`, so publish and subscribe topics always match.
	const workspaceId = await feedWorkspaceId(deps, config, session, pageId);
	return sendJson(response, 200, { ok: true, pageId, reactions: [...byEmoji.values()], commentCount, workspaceId }, config);
}

async function addReaction(deps, session, request, pageId, response, config) {
	const payload = await readJsonBody(request);
	const emoji = safeText(payload.emoji, 32);
	if (!emoji) throw httpError('emoji is required.', 422);
	const existing = await rest(config, deps.fetchImpl, `osionos_feed_reactions?page_id=eq.${pageId}&select=emoji`);
	const distinct = new Set((Array.isArray(existing) ? existing : []).map((row) => row.emoji));
	if (!distinct.has(emoji) && distinct.size >= MAX_DISTINCT_REACTIONS) {
		return sendJson(response, 409, { error: `A post can have at most ${MAX_DISTINCT_REACTIONS} distinct reactions.` }, config);
	}
	await rest(config, deps.fetchImpl, 'osionos_feed_reactions?on_conflict=page_id,user_id,emoji', {
		method: 'POST',
		body: { page_id: pageId, user_id: session.userId, emoji },
		prefer: 'resolution=ignore-duplicates,return=minimal',
	});
	await publishFeedEvent(deps, config, session, pageId, 'reaction');
	void notifyFeedOwner(deps, config, session, pageId, 'feed_reaction', emoji);
	return sendJson(response, 200, { ok: true }, config);
}

async function removeReaction(deps, session, request, pageId, response, config) {
	const payload = await readJsonBody(request);
	const emoji = safeText(payload.emoji, 32);
	if (!emoji) throw httpError('emoji is required.', 422);
	await rest(config, deps.fetchImpl, `osionos_feed_reactions?page_id=eq.${pageId}&user_id=eq.${session.userId}&emoji=eq.${encodeURIComponent(emoji)}`, {
		method: 'DELETE',
		prefer: 'return=minimal',
	});
	await publishFeedEvent(deps, config, session, pageId, 'reaction');
	return sendJson(response, 200, { ok: true }, config);
}

async function listComments(deps, session, pageId, response, config) {
	const rows = await rest(config, deps.fetchImpl, `osionos_feed_comments?page_id=eq.${pageId}&select=*&order=created_at.asc&limit=500`);
	const comments = Array.isArray(rows) ? rows : [];
	const identities = await identitySummaries(config, deps.fetchImpl, comments.map((row) => row.author_id));
	return sendJson(response, 200, {
		ok: true,
		pageId,
		comments: comments.map((row) => commentEntry(row, identities)),
	}, config);
}

async function postComment(deps, session, request, pageId, response, config) {
	const payload = await readJsonBody(request, 32 * 1024);
	const content = safeText(payload.content, 4000);
	if (!content) throw httpError('Comment content is required.', 422);
	let parentId = null;
	if (payload.parentId !== undefined && payload.parentId !== null && payload.parentId !== '') {
		const candidate = safeText(payload.parentId, 80);
		if (!UUID_REGEX.test(candidate)) throw httpError('parentId must reference an existing comment on this post.', 400);
		const parent = await rest(config, deps.fetchImpl, `osionos_feed_comments?id=eq.${candidate}&page_id=eq.${pageId}&select=id&limit=1`);
		if (!Array.isArray(parent) || parent.length === 0) throw httpError('parentId must reference an existing comment on this post.', 400);
		parentId = candidate;
	}
	const rows = await rest(config, deps.fetchImpl, 'osionos_feed_comments', {
		method: 'POST',
		body: { page_id: pageId, author_id: session.userId, content, parent_id: parentId },
		prefer: 'return=representation',
	});
	const row = Array.isArray(rows) ? rows[0] : rows;
	if (!row) throw httpError('Comment persistence failed.', 502);
	await publishFeedEvent(deps, config, session, pageId, 'comment');
	void notifyFeedOwner(deps, config, session, pageId, 'feed_comment', content);
	const identities = await identitySummaries(config, deps.fetchImpl, [session.userId]);
	const comment = commentEntry(row, identities);
	// Body IS the created comment object (new contract); `comment` mirror keeps
	// the pre-existing `reply.comment` consumer working — additive, non-breaking.
	return sendJson(response, 201, { ...comment, ok: true, comment }, config);
}

async function updateComment(deps, session, request, pageId, commentId, response, config) {
	const existingRows = await rest(config, deps.fetchImpl, `osionos_feed_comments?id=eq.${commentId}&page_id=eq.${pageId}&select=*&limit=1`);
	const existing = Array.isArray(existingRows) ? existingRows[0] : null;
	if (!existing) throw httpError('Comment not found.', 404);
	if (existing.author_id !== session.userId) throw httpError('Only the author can edit this comment.', 403);
	const payload = await readJsonBody(request, 32 * 1024);
	const content = safeText(payload.content, 4000);
	if (!content) throw httpError('Comment content is required.', 422);
	const rows = await rest(config, deps.fetchImpl, `osionos_feed_comments?id=eq.${commentId}`, {
		method: 'PATCH',
		body: { content, updated_at: new Date().toISOString() },
		prefer: 'return=representation',
	});
	const row = (Array.isArray(rows) ? rows[0] : rows) ?? { ...existing, content, updated_at: new Date().toISOString() };
	await publishFeedEvent(deps, config, session, pageId, 'comment_updated');
	const identities = await identitySummaries(config, deps.fetchImpl, [session.userId]);
	const comment = commentEntry(row, identities);
	return sendJson(response, 200, { ...comment, ok: true, comment }, config);
}

async function deleteComment(deps, session, pageId, commentId, response, config) {
	const existingRows = await rest(config, deps.fetchImpl, `osionos_feed_comments?id=eq.${commentId}&page_id=eq.${pageId}&select=author_id&limit=1`);
	const existing = Array.isArray(existingRows) ? existingRows[0] : null;
	if (!existing) throw httpError('Comment not found.', 404);
	if (existing.author_id !== session.userId) throw httpError('Only the author can delete this comment.', 403);
	await rest(config, deps.fetchImpl, `osionos_feed_comments?id=eq.${commentId}`, {
		method: 'DELETE',
		prefer: 'return=minimal',
	});
	await publishFeedEvent(deps, config, session, pageId, 'comment_deleted');
	return sendJson(response, 200, { ok: true }, config);
}

/** Shareable URL to a post: PUBLIC_APP_URL (or the app base) + ?view=<pageId>. */
function shareLink(deps, config, pageId) {
	const base = (safeText(deps.env.PUBLIC_APP_URL, 512) || config.appUrl || '').replace(/\/$/, '');
	return `${base}/?view=${pageId}`;
}

async function shareCount(deps, config, pageId) {
	const rows = await rest(config, deps.fetchImpl, `osionos_feed_shares?page_id=eq.${pageId}&select=id`);
	return Array.isArray(rows) ? rows.length : 0;
}

async function getShares(deps, session, pageId, response, config) {
	return sendJson(response, 200, { count: await shareCount(deps, config, pageId) }, config);
}

async function postShare(deps, session, request, pageId, response, config) {
	const payload = await readJsonBody(request);
	const target = safeText(payload.target, 16);
	if (!SHARE_TARGETS.has(target)) throw httpError("target must be one of 'profile', 'link', 'dm'.", 422);
	// 'dm' really delivers: the shared post lands as a live DM to the chosen person.
	// 'profile' records the share (surfaced on the sharer's profile); 'link' is copy-only.
	if (target === 'dm') {
		const dmUserId = requireUuid(safeText(payload.dmUserId, 80), 'dmUserId');
		await shareToDmChannel(deps, session, config, dmUserId, `📄 Shared a post with you\n${shareLink(deps, config, pageId)}`);
	}
	await rest(config, deps.fetchImpl, 'osionos_feed_shares', {
		method: 'POST',
		body: { page_id: pageId, user_id: session.userId, target },
		prefer: 'return=minimal',
	});
	await publishFeedEvent(deps, config, session, pageId, 'share');
	void notifyFeedOwner(deps, config, session, pageId, 'feed_share', null);
	return sendJson(response, 200, { ok: true, count: await shareCount(deps, config, pageId), link: shareLink(deps, config, pageId) }, config);
}

/**
 * Build the /api/feed dispatcher: `await handler(url, request, response)` →
 * true when handled. deps: { config, verifySession, fetchImpl?, env? }.
 */
export function createFeedHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
	return async function handleFeedRoute(url, request, response, requestConfig = config) {
		const pathname = url.pathname;
		if (!pathname.startsWith('/api/feed/')) return false;
		const commentOne = /^\/api\/feed\/([^/]+)\/comments\/([^/]+)$/.exec(pathname);
		const pageResource = /^\/api\/feed\/([^/]+)\/(like|likes|comments|reactions|share)$/.exec(pathname);
		if (!commentOne && !pageResource) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (commentOne) {
				const pageId = requireUuid(decodeURIComponent(commentOne[1]), 'pageId');
				const commentId = requireUuid(decodeURIComponent(commentOne[2]), 'commentId');
				if (method === 'PUT') return await updateComment(deps, session, request, pageId, commentId, response, requestConfig);
				if (method === 'DELETE') return await deleteComment(deps, session, pageId, commentId, response, requestConfig);
				return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
			}
			const pageId = requireUuid(decodeURIComponent(pageResource[1]), 'pageId');
			const resource = pageResource[2];
			if (resource === 'likes' && method === 'GET') return await getLikes(deps, session, pageId, response, requestConfig);
			if (resource === 'like' && method === 'POST') return await setLike(deps, session, pageId, true, response, requestConfig);
			if (resource === 'like' && method === 'DELETE') return await setLike(deps, session, pageId, false, response, requestConfig);
			if (resource === 'comments' && method === 'GET') return await listComments(deps, session, pageId, response, requestConfig);
			if (resource === 'comments' && method === 'POST') return await postComment(deps, session, request, pageId, response, requestConfig);
			if (resource === 'reactions' && method === 'GET') return await getReactions(deps, session, pageId, response, requestConfig);
			if (resource === 'reactions' && method === 'POST') return await addReaction(deps, session, request, pageId, response, requestConfig);
			if (resource === 'reactions' && method === 'DELETE') return await removeReaction(deps, session, request, pageId, response, requestConfig);
			if (resource === 'share' && method === 'GET') return await getShares(deps, session, pageId, response, requestConfig);
			if (resource === 'share' && method === 'POST') return await postShare(deps, session, request, pageId, response, requestConfig);
			return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Feed request failed.' }, requestConfig);
		}
	};
}
