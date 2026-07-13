/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-comments.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Block-anchored page comments (`/api/comments`). Read/post require page read
 * access (owner or workspace member) — `verifyPageAccess` is injected by
 * bridge-api to avoid an import cycle. Edit/resolve/delete are author-only. A new
 * comment notifies + pushes the page owner. Reads are service-role-scoped by the
 * verified page access, so RLS own-row is defence in depth only.
 */

import { bearerToken, readJsonBody, rest, sendJson } from './bridge-social-core.mjs';
import { pushToUser } from './bridge-push.mjs';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function commentEntry(row) {
	return {
		id: row.id, pageId: row.page_id, blockId: row.block_id ?? null, authorId: row.author_id,
		content: row.content, resolvedAt: row.resolved_at ?? null, createdAt: row.created_at,
	};
}

function commentIdFromPath(pathname) {
	const match = /^\/api\/comments\/([^/]+)$/.exec(pathname);
	return match && UUID_RE.test(match[1]) ? match[1] : '';
}

async function listComments(deps, request, url, response, config) {
	const pageId = String(url.searchParams.get('pageId') ?? '');
	if (!UUID_RE.test(pageId)) return sendJson(response, 400, { ok: false, message: 'Missing pageId.' }, config);
	await deps.verifyPageAccess(request, pageId, 'read'); // throws 403/404
	const rows = await rest(config, deps.fetchImpl, `osionos_page_comments?page_id=eq.${pageId}&select=*&order=created_at.asc`);
	return sendJson(response, 200, { ok: true, comments: (Array.isArray(rows) ? rows : []).map(commentEntry) }, config);
}

async function createComment(deps, session, request, response, config) {
	const payload = await readJsonBody(request).catch(() => ({}));
	const pageId = String(payload?.pageId ?? '');
	const content = String(payload?.content ?? '').trim();
	const blockId = payload?.blockId ? String(payload.blockId) : null;
	if (!UUID_RE.test(pageId) || !content) return sendJson(response, 400, { ok: false, message: 'Invalid comment.' }, config);
	const { row } = await deps.verifyPageAccess(request, pageId, 'read');
	const inserted = await rest(config, deps.fetchImpl, 'osionos_page_comments', {
		method: 'POST',
		body: { page_id: pageId, block_id: blockId, author_id: session.userId, content },
		prefer: 'return=representation',
	});
	const created = Array.isArray(inserted) && inserted[0] ? commentEntry(inserted[0]) : null;
	if (row.owner_id && row.owner_id !== session.userId) {
		const preview = `New comment: ${content.slice(0, 80)}`;
		await rest(config, deps.fetchImpl, 'osionos_notifications', {
			method: 'POST',
			body: { user_id: row.owner_id, type: 'page_comment', actor_id: session.userId, channel_id: pageId, preview },
			prefer: 'return=minimal',
		}).catch(() => {});
		await pushToUser(config, deps.fetchImpl, row.owner_id, JSON.stringify({ title: 'New comment', body: preview, url: '/' }));
	}
	return sendJson(response, 200, { ok: true, comment: created }, config);
}

/** Fetch a comment's author, or send 404/403 if missing / not the caller's. */
async function requireOwnComment(deps, session, commentId, response, config) {
	const rows = await rest(config, deps.fetchImpl, `osionos_page_comments?id=eq.${commentId}&select=author_id`);
	const comment = Array.isArray(rows) && rows[0];
	if (!comment) { sendJson(response, 404, { ok: false, message: 'Comment not found.' }, config); return false; }
	if (comment.author_id !== session.userId) { sendJson(response, 403, { ok: false, message: 'Not your comment.' }, config); return false; }
	return true;
}

async function updateComment(deps, session, commentId, request, response, config) {
	if (!await requireOwnComment(deps, session, commentId, response, config)) return true;
	const payload = await readJsonBody(request).catch(() => ({}));
	const patch = {};
	if (typeof payload?.content === 'string') patch.content = payload.content.trim();
	if (typeof payload?.resolved === 'boolean') patch.resolved_at = payload.resolved ? new Date().toISOString() : null;
	if (Object.keys(patch).length === 0) return sendJson(response, 200, { ok: true }, config);
	await rest(config, deps.fetchImpl, `osionos_page_comments?id=eq.${commentId}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
	return sendJson(response, 200, { ok: true }, config);
}

async function deleteComment(deps, session, commentId, response, config) {
	if (!await requireOwnComment(deps, session, commentId, response, config)) return true;
	await rest(config, deps.fetchImpl, `osionos_page_comments?id=eq.${commentId}`, { method: 'DELETE', prefer: 'return=minimal' });
	return sendJson(response, 200, { ok: true }, config);
}

/** Build the /api/comments dispatcher. deps: { config, verifySession, verifyPageAccess, fetchImpl? }. */
export function createCommentsHandler({ config, verifySession, verifyPageAccess, fetchImpl = fetch }) {
	const deps = { fetchImpl, verifyPageAccess };
	return async function handleCommentsRoute(url, request, response, requestConfig = config) {
		if (!url.pathname.startsWith('/api/comments')) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (url.pathname === '/api/comments' && method === 'GET') return await listComments(deps, request, url, response, requestConfig);
			if (url.pathname === '/api/comments' && method === 'POST') return await createComment(deps, session, request, response, requestConfig);
			const commentId = commentIdFromPath(url.pathname);
			if (commentId && method === 'PATCH') return await updateComment(deps, session, commentId, request, response, requestConfig);
			if (commentId && method === 'DELETE') return await deleteComment(deps, session, commentId, response, requestConfig);
			return sendJson(response, 404, { ok: false, message: 'Comment route not found.' }, requestConfig);
		} catch (error) {
			return sendJson(response, error?.status ?? 500, { ok: false, message: error instanceof Error ? error.message : 'Comment request failed.' }, requestConfig);
		}
	};
}
