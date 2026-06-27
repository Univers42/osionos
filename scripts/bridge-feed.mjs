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
 * Feed interactions (likes + comments) for the osionos bridge — standalone
 * module in the bridge-rtc style (bridge-api.mjs injects `config` +
 * `verifySession`).
 *
 * Routes (pageId must be a UUID — feed cards backed by non-UUID synthetic ids
 * get a 422 and the client treats the feature as absent):
 *   GET    /api/feed/:pageId/likes      {count, likedByMe}
 *   POST   /api/feed/:pageId/like       idempotent like
 *   DELETE /api/feed/:pageId/like       remove my like
 *   GET    /api/feed/:pageId/comments   [{id, authorId, authorName, content, createdAt}]
 *   POST   /api/feed/:pageId/comments   {content}
 *
 * After a like/comment the module publishes (best-effort) on
 * `feed:<workspaceId>` — workspace resolved from osionos_pages when the page
 * exists there, else OSIONOS_ORG_WORKSPACE_ID, else the session's workspace.
 */

import {
	bearerToken,
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

async function listComments(deps, session, pageId, response, config) {
	const rows = await rest(config, deps.fetchImpl, `osionos_feed_comments?page_id=eq.${pageId}&select=*&order=created_at.asc&limit=200`);
	const comments = Array.isArray(rows) ? rows : [];
	const identities = await identitySummaries(config, deps.fetchImpl, comments.map((row) => row.author_id));
	return sendJson(response, 200, {
		ok: true,
		pageId,
		comments: comments.map((row) => ({
			id: row.id,
			pageId: row.page_id,
			authorId: row.author_id,
			authorName: identities.get(row.author_id)?.name ?? 'Member',
			authorAvatar: identities.get(row.author_id)?.avatar ?? null,
			content: row.content,
			createdAt: row.created_at,
		})),
	}, config);
}

async function postComment(deps, session, request, pageId, response, config) {
	const payload = await readJsonBody(request, 32 * 1024);
	const content = safeText(payload.content, 4000);
	if (!content) throw httpError('Comment content is required.', 422);
	const rows = await rest(config, deps.fetchImpl, 'osionos_feed_comments', {
		method: 'POST',
		body: { page_id: pageId, author_id: session.userId, content },
		prefer: 'return=representation',
	});
	const row = Array.isArray(rows) ? rows[0] : rows;
	if (!row) throw httpError('Comment persistence failed.', 502);
	await publishFeedEvent(deps, config, session, pageId, 'comment');
	const identities = await identitySummaries(config, deps.fetchImpl, [session.userId]);
	return sendJson(response, 201, {
		ok: true,
		comment: {
			id: row.id,
			pageId,
			authorId: session.userId,
			authorName: identities.get(session.userId)?.name ?? 'Member',
			content: row.content,
			createdAt: row.created_at,
		},
	}, config);
}

/**
 * Build the /api/feed dispatcher: `await handler(url, request, response)` →
 * true when handled. deps: { config, verifySession, fetchImpl?, env? }.
 */
export function createFeedHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
	return async function handleFeedRoute(url, request, response, requestConfig = config) {
		const match = /^\/api\/feed\/([^/]+)\/(like|likes|comments)$/.exec(url.pathname);
		if (!match) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			const pageId = requireUuid(decodeURIComponent(match[1]), 'pageId');
			const resource = match[2];
			if (resource === 'likes' && method === 'GET') return await getLikes(deps, session, pageId, response, requestConfig);
			if (resource === 'like' && method === 'POST') return await setLike(deps, session, pageId, true, response, requestConfig);
			if (resource === 'like' && method === 'DELETE') return await setLike(deps, session, pageId, false, response, requestConfig);
			if (resource === 'comments' && method === 'GET') return await listComments(deps, session, pageId, response, requestConfig);
			if (resource === 'comments' && method === 'POST') return await postComment(deps, session, request, pageId, response, requestConfig);
			return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Feed request failed.' }, requestConfig);
		}
	};
}
