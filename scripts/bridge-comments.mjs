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
 *
 * Replies, suggestions and reactions (#228) live in bridge-discussions.mjs and are
 * on only when bridge-api injects `pageAccess` and the probe sees the columns.
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
import {
	announce,
	createDiscussionProbe,
	deleteOwnRow,
	discussionDraft,
	discussionFields,
	handleDiscussionRoute,
	patchOpenRow,
	reactionsFor,
	requireDiscussions,
} from './bridge-discussions.mjs';
import { parseSuggestion } from './bridge-discussions-input.mjs';
import { pushToUser } from './bridge-push.mjs';
import { decideWrite, recordDecision } from './bridge-moderation-gate.mjs';
import { requireInteraction } from './bridge-moderation-core.mjs';

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
	const list = Array.isArray(rows) ? rows : [];
	const discussions = Boolean(deps.pageAccess) && list.length > 0 && await deps.discussionsAvailable(config);
	const reactions = discussions
		? await reactionsFor(deps, config, new Set(list.map((row) => row.id)), session.userId)
		: new Map();
	const comments = list.map((row) => (discussions
		? { ...commentEntry(row), ...discussionFields(row, reactions.get(row.id)) }
		: commentEntry(row)));
	return sendJson(response, 200, { ok: true, comments }, config);
}

async function createComment(deps, session, request, response, config) {
	const payload = await readJsonBody(request).catch(() => ({}));
	const pageId = String(payload?.pageId ?? '');
	const content = String(payload?.content ?? '').trim();
	const blockId = payload?.blockId ? String(payload.blockId) : null;
	if (!UUID_RE.test(pageId)) return sendJson(response, 400, { ok: false, message: 'Invalid comment.' }, config);
	// #228: a reply or a suggestion needs can_comment and its own bounds; a legacy
	// comment keeps the page-read policy.
	const draft = await discussionDraft(deps, session, request, payload, pageId, config);
	if (!draft && !content) return sendJson(response, 400, { ok: false, message: 'Invalid comment.' }, config);
	const { row } = draft ?? await deps.verifyPageAccess(request, pageId, 'read');
	// The page owner's interaction limit, judged before anything is written.
	if (row.owner_id) {
		await requireInteraction(config, deps.fetchImpl, { interaction: 'comments', actorId: session.userId, targetId: row.owner_id, workspaceId: row.workspace_id });
	}
	// L0 runs BEFORE the write: a warning is the author's question (409), a hold
	// is a comment written held and seen by nobody but its author (C85, C87).
	const { mode, stateEnabled } = moderationSettings(deps.env);
	// Without the state column nothing is held or recorded: no workspace read.
	const publicReadable = stateEnabled && await publicReadablePage(config, deps.fetchImpl, row);
	const decision = decideWrite({
		text: draft?.text ?? content,
		surface: 'page_comment',
		mode,
		publicReadable,
		acknowledged: payload?.acknowledgeWarning === true,
		stateEnabled,
	});
	if (decision.outcome === 'needs_ack') return sendJson(response, 409, moderationWarningBody(decision), config);
	const held = decision.outcome === 'write_held';
	const body = { page_id: pageId, block_id: blockId, author_id: session.userId, content, ...draft?.extra };
	if (held) body.moderation_state = 'held';
	const inserted = await rest(config, deps.fetchImpl, 'osionos_page_comments', {
		method: 'POST',
		body,
		prefer: 'return=representation',
	});
	const createdRow = Array.isArray(inserted) ? inserted[0] : null;
	const created = createdRow ? { ...commentEntry(createdRow), ...(draft ? discussionFields(createdRow) : {}) } : null;
	if (held && created) created.moderationState = 'held';
	if (draft && created && !held) announce(deps, pageId, created.id, 'created');
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
	const rows = await rest(config, deps.fetchImpl, `osionos_page_comments?id=eq.${commentId}&select=*`);
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
	const discussions = 'kind' in comment && Boolean(deps.pageAccess);
	if (payload?.suggestion !== undefined) {
		await requireDiscussions(deps, config);
		patch.suggestion = parseSuggestion(payload.suggestion);
	}
	if (Object.keys(patch).length === 0) return sendJson(response, 200, { ok: true }, config);
	// Only a content-bearing PATCH is checked: resolving a comment says nothing
	// new about the words.
	let decision = null;
	let page = null;
	if (typeof patch.content === 'string' || patch.suggestion) {
		const { mode, stateEnabled } = moderationSettings(deps.env);
		const pageId = typeof comment.page_id === 'string' && comment.page_id ? comment.page_id : null;
		const pageRows = pageId ? await rest(config, deps.fetchImpl, `osionos_pages?id=eq.${pageId}&select=owner_id,visibility,workspace_id&limit=1`) : [];
		page = Array.isArray(pageRows) ? pageRows[0] : null;
		if (page?.owner_id) {
			await requireInteraction(config, deps.fetchImpl, { interaction: 'comments', actorId: session.userId, targetId: page.owner_id, workspaceId: page.workspace_id });
		}
		const publicReadable = stateEnabled && await publicReadablePage(config, deps.fetchImpl, page);
		decision = decideWrite({
			// S8: an edited insert is words too, read with the quote it replaces.
			text: [patch.content, patch.suggestion?.insert, comment.anchor?.quote].filter(Boolean).join('\n'),
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
	if (discussions) await patchOpenRow(deps, session, commentId, patch, config);
	else await rest(config, deps.fetchImpl, `osionos_page_comments?id=eq.${commentId}`, { method: 'PATCH', body: patch, prefer: 'return=minimal' });
	if (discussions && comment.moderation_state !== 'held' && patch.moderation_state !== 'held') announce(deps, comment.page_id, commentId, 'edited');
	if (decision?.record) {
		await recordDecision(config, deps.fetchImpl, {
			subjectKind: 'page_comment',
			subjectId: commentId,
			workspaceId: page?.workspace_id ?? null,
			authorId: session.userId,
			action: decision.record,
			mode: moderationSettings(deps.env).mode,
			policyHash: decision.policyHash,
			content: [patch.content, patch.suggestion?.insert].filter(Boolean).join('\n'),
		});
	}
	return sendJson(response, 200, { ok: true }, config);
}

async function deleteComment(deps, session, commentId, response, config) {
	const comment = await requireOwnComment(deps, session, commentId, response, config);
	if (!comment) return true;
	if (!('kind' in comment) || !deps.pageAccess) {
		await rest(config, deps.fetchImpl, `osionos_page_comments?id=eq.${commentId}`, { method: 'DELETE', prefer: 'return=minimal' });
		return sendJson(response, 200, { ok: true }, config);
	}
	const outcome = await deleteOwnRow(deps, session, comment, config);
	if (comment.moderation_state !== 'held') announce(deps, comment.page_id, commentId, 'deleted');
	return sendJson(response, 200, { ok: true, deleted: outcome }, config);
}

/**
 * Build the /api/comments dispatcher. deps: { config, verifySession, verifyPageAccess,
 * pageAccess?, fetchImpl?, env?, publishFetch? }. Without `pageAccess` the #228 routes 404.
 */
export function createCommentsHandler({ config, verifySession, verifyPageAccess, pageAccess = null, fetchImpl = fetch, env = process.env, publishFetch }) {
	const deps = { fetchImpl, verifyPageAccess, pageAccess, env, publishFetch, discussionsAvailable: createDiscussionProbe(fetchImpl) };
	return async function handleCommentsRoute(url, request, response, requestConfig = config) {
		if (!url.pathname.startsWith('/api/comments')) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (url.pathname === '/api/comments' && method === 'GET') return await listComments(deps, session, request, url, response, requestConfig);
			if (url.pathname === '/api/comments' && method === 'POST') return await createComment(deps, session, request, response, requestConfig);
			if (await handleDiscussionRoute(deps, session, url, method, request, response, requestConfig)) return true;
			const commentId = commentIdFromPath(url.pathname);
			if (commentId && method === 'PATCH') return await updateComment(deps, session, commentId, request, response, requestConfig);
			if (commentId && method === 'DELETE') return await deleteComment(deps, session, commentId, response, requestConfig);
			return sendJson(response, 404, { ok: false, message: 'Comment route not found.' }, requestConfig);
		} catch (error) {
			const body = { ok: false, message: error instanceof Error ? error.message : 'Comment request failed.' };
			if (typeof error?.code === 'string') body.code = error.code;
			if (typeof error?.reason === 'string') body.reason = error.reason;
			return sendJson(response, error?.status ?? 500, body, requestConfig);
		}
	};
}
