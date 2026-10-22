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
 * access (bridge-page-read.mjs: a page the caller may read, else the same 404 as a
 * missing page) — `verifyPageAccess` is injected by
 * bridge-api to avoid an import cycle. Edit/resolve/delete are author-only. A new
 * comment notifies + pushes the page owner. Reads are service-role-scoped by the
 * verified page access, so RLS own-row is defence in depth only.
 *
 * L0 runs BEFORE a comment is written (bridge-moderation-gate.mjs): a comment
 * that trips the rules is either asked about (409) or written HELD, and a held
 * comment is seen by its author alone (C87). The state column and the audit
 * table arrive with the groot migration, so the flag OSIONOS_MODERATION_STATE=1
 * goes on only after it — the readers' `or=` filter 400s without the column.
 */

import {
	bearerToken,
	moderationSettings,
	moderationWarningBody,
	publicReadablePage,
	readJsonBody,
	rest,
	sendJson,
	visibleOrOwnFilter,
} from './bridge-social-core.mjs';
import { pushToUser } from './bridge-push.mjs';
import { decideWrite, recordDecision } from './bridge-moderation-gate.mjs';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function commentEntry(row) {
	return {
		id: row.id, pageId: row.page_id, blockId: row.block_id ?? null, authorId: row.author_id,
		content: row.content, resolvedAt: row.resolved_at ?? null, createdAt: row.created_at,
		// C87: the soft state. A row without the column (the flag is off) is visible.
		moderationState: row.moderation_state ?? 'visible',
	};
}

function commentIdFromPath(pathname) {
	const match = /^\/api\/comments\/([^/]+)$/.exec(pathname);
	return match && UUID_RE.test(match[1]) ? match[1] : '';
}

async function listComments(deps, session, request, url, response, config) {
	const pageId = String(url.searchParams.get('pageId') ?? '');
	if (!UUID_RE.test(pageId)) return sendJson(response, 400, { ok: false, message: 'Missing pageId.' }, config);
	await deps.verifyPageAccess(request, pageId, 'read'); // throws 403/404
	// C87: a held comment is the author's alone.
	const filter = visibleOrOwnFilter(session, moderationSettings(deps.env).stateEnabled);
	const rows = await rest(config, deps.fetchImpl, `osionos_page_comments?page_id=eq.${pageId}&select=*&order=created_at.asc${filter}`);
	return sendJson(response, 200, { ok: true, comments: (Array.isArray(rows) ? rows : []).map(commentEntry) }, config);
}

async function createComment(deps, session, request, response, config) {
	const payload = await readJsonBody(request).catch(() => ({}));
	const pageId = String(payload?.pageId ?? '');
	const content = String(payload?.content ?? '').trim();
	const blockId = payload?.blockId ? String(payload.blockId) : null;
	if (!UUID_RE.test(pageId) || !content) return sendJson(response, 400, { ok: false, message: 'Invalid comment.' }, config);
	const { row } = await deps.verifyPageAccess(request, pageId, 'read');
	// L0 runs BEFORE the write: a warning is the author's question (409), a hold
	// is a comment written held and seen by nobody but its author (C85, C87).
	const { mode, stateEnabled } = moderationSettings(deps.env);
	const publicReadable = await publicReadablePage(config, deps.fetchImpl, row);
	const decision = decideWrite({
		text: content,
		surface: 'page_comment',
		mode,
		publicReadable,
		acknowledged: payload?.acknowledgeWarning === true,
		stateEnabled,
	});
	if (decision.outcome === 'needs_ack') return sendJson(response, 409, moderationWarningBody(decision), config);
	const held = decision.outcome === 'write_held';
	const body = { page_id: pageId, block_id: blockId, author_id: session.userId, content };
	if (held) body.moderation_state = 'held';
	const inserted = await rest(config, deps.fetchImpl, 'osionos_page_comments', {
		method: 'POST',
		body,
		prefer: 'return=representation',
	});
	const created = Array.isArray(inserted) && inserted[0] ? commentEntry(inserted[0]) : null;
	if (held && created) created.moderationState = 'held';
	// A held comment is the author's alone: nobody is notified about it (C87).
	if (!held && row.owner_id && row.owner_id !== session.userId) {
		const preview = `New comment: ${content.slice(0, 80)}`;
		await rest(config, deps.fetchImpl, 'osionos_notifications', {
			method: 'POST',
			body: { user_id: row.owner_id, type: 'page_comment', actor_id: session.userId, channel_id: pageId, preview },
			prefer: 'return=minimal',
		}).catch(() => {});
		await pushToUser(config, deps.fetchImpl, row.owner_id, JSON.stringify({ title: 'New comment', body: preview, url: '/' }));
	}
	if (decision.record && created) {
		await recordDecision(config, deps.fetchImpl, {
			subjectKind: 'page_comment',
			subjectId: created.id,
			workspaceId: row.workspace_id ?? null,
			authorId: session.userId,
			action: decision.record,
			mode,
			policyHash: decision.policyHash,
			content,
		});
	}
	return sendJson(response, 200, { ok: true, comment: created }, config);
}

/** Fetch a comment's author, or send 404/403 if missing / not the caller's. */
async function requireOwnComment(deps, session, commentId, response, config) {
	const rows = await rest(config, deps.fetchImpl, `osionos_page_comments?id=eq.${commentId}&select=author_id,page_id`);
	const comment = Array.isArray(rows) && rows[0];
	if (!comment) { sendJson(response, 404, { ok: false, message: 'Comment not found.' }, config); return null; }
	if (comment.author_id !== session.userId) { sendJson(response, 403, { ok: false, message: 'Not your comment.' }, config); return null; }
	return comment;
}

async function updateComment(deps, session, commentId, request, response, config) {
	const comment = await requireOwnComment(deps, session, commentId, response, config);
	if (!comment) return true;
	const payload = await readJsonBody(request).catch(() => ({}));
	const patch = {};
	if (typeof payload?.content === 'string') patch.content = payload.content.trim();
	if (typeof payload?.resolved === 'boolean') patch.resolved_at = payload.resolved ? new Date().toISOString() : null;
	if (Object.keys(patch).length === 0) return sendJson(response, 200, { ok: true }, config);
	// Only a content-bearing PATCH is checked: resolving a comment says nothing
	// new about the words.
	let decision = null;
	let page = null;
	if (typeof patch.content === 'string') {
		const { mode, stateEnabled } = moderationSettings(deps.env);
		const pageId = typeof comment.page_id === 'string' && comment.page_id ? comment.page_id : null;
		const pageRows = pageId ? await rest(config, deps.fetchImpl, `osionos_pages?id=eq.${pageId}&select=visibility,workspace_id&limit=1`) : [];
		page = Array.isArray(pageRows) ? pageRows[0] : null;
		const publicReadable = await publicReadablePage(config, deps.fetchImpl, page);
		decision = decideWrite({
			text: patch.content,
			surface: 'page_comment',
			mode,
			publicReadable,
			acknowledged: payload?.acknowledgeWarning === true,
			stateEnabled,
		});
		if (decision.outcome === 'needs_ack') return sendJson(response, 409, moderationWarningBody(decision), config);
		// C89: an edit may only HOLD a comment, never un-hold it. A held comment
		// edited to a clean text stays held: the PATCH says nothing about the state.
		if (decision.outcome === 'write_held') patch.moderation_state = 'held';
	}
	await rest(config, deps.fetchImpl, `osionos_page_comments?id=eq.${commentId}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
	if (decision?.record) {
		await recordDecision(config, deps.fetchImpl, {
			subjectKind: 'page_comment',
			subjectId: commentId,
			workspaceId: page?.workspace_id ?? null,
			authorId: session.userId,
			action: decision.record,
			mode: moderationSettings(deps.env).mode,
			policyHash: decision.policyHash,
			content: patch.content,
		});
	}
	return sendJson(response, 200, { ok: true }, config);
}

async function deleteComment(deps, session, commentId, response, config) {
	if (!await requireOwnComment(deps, session, commentId, response, config)) return true;
	await rest(config, deps.fetchImpl, `osionos_page_comments?id=eq.${commentId}`, { method: 'DELETE', prefer: 'return=minimal' });
	return sendJson(response, 200, { ok: true }, config);
}

/** Build the /api/comments dispatcher. deps: { config, verifySession, verifyPageAccess, fetchImpl?, env? }. */
export function createCommentsHandler({ config, verifySession, verifyPageAccess, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, verifyPageAccess, env };
	return async function handleCommentsRoute(url, request, response, requestConfig = config) {
		if (!url.pathname.startsWith('/api/comments')) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (url.pathname === '/api/comments' && method === 'GET') return await listComments(deps, session, request, url, response, requestConfig);
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
