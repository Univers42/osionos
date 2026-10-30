/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-discussions.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Replies, suggested edits and reactions on page comments (#228), the half of
 * /api/comments that needs groot's osionos-discussions-migration.sql. bridge-comments.mjs
 * dispatches here; every route and field answers 404 / is absent until the probe sees
 * the columns (S13), so this ships before the migration is applied.
 *
 * Who may do what (S1, S6) comes from `pageAccess(request, pageId)`, injected by
 * bridge-api (pageDiscussionAccess): `level` for reply / suggest / react (>= can_comment),
 * `canWrite` — the page PATCH's own gate — for accept (C8, C9). The decide itself, text
 * and verdict in one transaction, is the SQL function osionos_decide_suggestion.
 * The bridge never takes status, author_id or decided_by from the client.
 */

import { inFilter } from './bridge-paging.mjs';
import { publishRealtime, readInChunks, readJsonBody, rest, restCount, sendJson } from './bridge-social-core.mjs';
import {
	MAX_OPEN_PER_BLOCK,
	SUGGESTIBLE_TYPES,
	findBlock,
	invalid,
	levelAtLeast,
	parseAnchor,
	parseEmoji,
	parseSuggestion,
} from './bridge-discussions-input.mjs';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;
const PROBE_TTL_MS = 60_000;
const VERDICTS = new Set(['accepted', 'rejected']);
const REFUSAL_STATUS = { missing: 404, decided: 409, changed: 409, stale: 409, archived: 409, unsupported: 409 };

function httpError(message, status, extra = {}) {
	return Object.assign(new Error(message), { status, ...extra });
}

const notFound = () => httpError('Comment route not found.', 404);

/** A PostgREST answer for a column or table that does not exist yet. */
function isSchemaMiss(error) {
	const message = error instanceof Error ? error.message : '';
	return error?.status === 404 || (error?.status === 502 && message.includes('failed with 400'));
}

/**
 * Whether the #228 schema is there, probed once and kept PROBE_TTL_MS (C16).
 * Caveat: the answer is up to 60 s old — right after the migration the routes still
 * 404, right after a rollback they 502 until the next probe. A BaaS outage is not a
 * missing schema: it throws and nothing is cached.
 */
export function createDiscussionProbe(fetchImpl, now = Date.now) {
	let cached = null;
	let at = 0;
	return async function discussionsAvailable(config) {
		if (cached !== null && now() - at < PROBE_TTL_MS) return cached;
		try {
			await rest(config, fetchImpl, 'osionos_page_comments?select=kind,parent_id,anchor,suggestion,status,decided_by,deleted_at,updated_at&limit=0');
			await rest(config, fetchImpl, 'osionos_page_comment_reactions?select=emoji&limit=0');
			cached = true;
		} catch (error) {
			if (!isSchemaMiss(error)) throw error;
			cached = false;
		}
		at = now();
		return cached;
	};
}

export async function requireDiscussions(deps, config) {
	if (!deps.pageAccess || !await deps.discussionsAvailable(config)) throw notFound();
}

/** The #228 fields of one row; `{}` on a row from before the migration. */
export function discussionFields(row, reactions = []) {
	if (!('kind' in row)) return {};
	const deleted = row.deleted_at != null;
	return {
		parentId: row.parent_id ?? null,
		kind: row.kind,
		anchor: row.anchor ?? null,
		suggestion: deleted ? null : row.suggestion ?? null,
		status: row.status,
		decidedBy: row.decided_by ?? null,
		deleted,
		updatedAt: row.updated_at,
		reactions,
		...(deleted ? { content: '' } : {}),
	};
}

/**
 * The reactions on the page's visible rows, as commentId → [{emoji, count, mine}].
 * Read by comment id, never by page: a held row's reactions are not counted for
 * anyone who cannot see it (S9), because its id is not asked for.
 */
export async function reactionsFor(deps, config, visibleIds, userId) {
	const rows = await readInChunks([...visibleIds], async (chunk) => {
		const part = await rest(config, deps.fetchImpl, `osionos_page_comment_reactions?${inFilter('comment_id', chunk)}&select=comment_id,emoji,user_id&order=created_at.asc`);
		return Array.isArray(part) ? part : [];
	});
	const byComment = new Map();
	for (const row of rows) {
		const list = byComment.get(row.comment_id) ?? [];
		let entry = list.find((reaction) => reaction.emoji === row.emoji);
		if (!entry) list.push(entry = { emoji: row.emoji, count: 0, mine: false });
		entry.count += 1;
		entry.mine ||= row.user_id === userId;
		byComment.set(row.comment_id, list);
	}
	return byComment;
}

async function commentRow(deps, config, commentId) {
	const rows = await rest(config, deps.fetchImpl, `osionos_page_comments?id=eq.${commentId}&select=*&limit=1`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** A row the caller may see: missing, or held and not theirs (C87), is the same 404. */
function visibleTo(row, userId) {
	return row && !(row.moderation_state === 'held' && row.author_id !== userId);
}

async function requireParent(deps, config, parentId, pageId, userId) {
	if (typeof parentId !== 'string' || !UUID_RE.test(parentId)) throw invalid('parentId must be a UUID.');
	const parent = await commentRow(deps, config, parentId);
	if (!visibleTo(parent, userId) || parent.page_id !== pageId) throw invalid('The parent is not a comment on this page.');
	if (parent.parent_id) throw invalid('A reply answers a root, not another reply.');
}

async function suggestionFields(deps, config, payload, pageId, userId) {
	const blockId = typeof payload.blockId === 'string' ? payload.blockId : '';
	if (!blockId || blockId.length > 128) throw invalid('A suggestion needs its blockId.');
	const anchor = parseAnchor(payload.anchor);
	const suggestion = parseSuggestion(payload.suggestion);
	const pages = await rest(config, deps.fetchImpl, `osionos_pages?id=eq.${pageId}&select=content&limit=1`);
	const block = findBlock(Array.isArray(pages) ? pages[0]?.content : null, blockId);
	if (!block) throw invalid('The block is not on this page.');
	if (!SUGGESTIBLE_TYPES.has(block.type)) throw invalid('This block does not take suggestions.');
	const open = await restCount(config, deps.fetchImpl,
		`osionos_page_comments?page_id=eq.${pageId}&block_id=eq.${encodeURIComponent(blockId)}&author_id=eq.${userId}&kind=eq.suggestion&status=eq.open&deleted_at=is.null&select=id`);
	if (open >= MAX_OPEN_PER_BLOCK) throw httpError(`At most ${MAX_OPEN_PER_BLOCK} open suggestions per block.`, 429);
	return { anchor, suggestion };
}

/**
 * The #228 part of a POST /api/comments body, checked; null for a legacy comment
 * (no kind, parentId, anchor or suggestion), which keeps its page-read policy.
 * Answers the access (its page row), the extra columns, and the text L0 reads.
 */
export async function discussionDraft(deps, session, request, payload, pageId, config) {
	const wanted = ['kind', 'parentId', 'anchor', 'suggestion'].some((key) => payload?.[key] !== undefined && payload[key] !== null);
	if (!wanted) return null;
	await requireDiscussions(deps, config);
	const access = await deps.pageAccess(request, pageId);
	if (!levelAtLeast(access.level, 'can_comment')) throw httpError('Commenting on this page is not allowed.', 403);
	const kind = payload.kind ?? 'comment';
	if (kind !== 'comment' && kind !== 'suggestion') throw invalid('kind must be comment or suggestion.');
	const extra = { kind };
	const content = String(payload.content ?? '').trim();
	let moderated = [content];
	if (payload.parentId != null) {
		if (kind === 'suggestion') throw invalid('A suggestion starts its own thread.');
		await requireParent(deps, config, payload.parentId, pageId, session.userId);
		extra.parent_id = payload.parentId;
	}
	if (kind === 'suggestion') {
		const { anchor, suggestion } = await suggestionFields(deps, config, payload, pageId, session.userId);
		extra.anchor = anchor;
		extra.suggestion = suggestion;
		moderated = [content, suggestion.insert, anchor.quote];
	} else if (!content) {
		throw invalid('Invalid comment.');
	}
	return { row: access.row, extra, text: moderated.filter(Boolean).join('\n') };
}

/** S3: the author's PATCH lands only while the row is open and live; else 409 decided. */
export async function patchOpenRow(deps, session, commentId, patch, config) {
	const kindFilter = patch.suggestion ? '&kind=eq.suggestion' : '';
	const rows = await rest(config, deps.fetchImpl,
		`osionos_page_comments?id=eq.${commentId}&author_id=eq.${session.userId}&status=eq.open&deleted_at=is.null${kindFilter}`,
		{ method: 'PATCH', body: patch, prefer: 'return=representation' });
	if (!Array.isArray(rows) || rows.length === 0) throw httpError('This suggestion was already decided.', 409, { reason: 'decided' });
}

const isGuardRefusal = (error) => error?.status === 502 && /\b23503\b/.test(error.message ?? '');

/**
 * S4: an open row without replies is deleted; one with replies is blanked and kept
 * (the DB guard refuses its DELETE); a decided suggestion is history (409).
 */
export async function deleteOwnRow(deps, session, comment, config) {
	if (comment.status && comment.status !== 'open') throw httpError('A decided suggestion is kept.', 409, { reason: 'decided' });
	try {
		await rest(config, deps.fetchImpl, `osionos_page_comments?id=eq.${comment.id}`, { method: 'DELETE', prefer: 'return=minimal' });
		return 'deleted';
	} catch (error) {
		if (!isGuardRefusal(error)) throw error;
	}
	await patchOpenRow(deps, session, comment.id, { deleted_at: new Date().toISOString(), content: '' }, config);
	return 'soft';
}

/** Tells the page's readers a thread moved; ids only — a reader refetches what it may see. */
export function announce(deps, pageId, commentId, change) {
	void publishRealtime({
		topic: `collabpage:${pageId}`,
		eventType: 'discussion_changed',
		payload: { pageId, commentId, change },
		fetchImpl: deps.publishFetch,
		env: deps.env,
	});
}

async function decideRoute(deps, session, commentId, request, response, config) {
	const row = await commentRow(deps, config, commentId);
	if (!visibleTo(row, session.userId) || row.kind !== 'suggestion') throw notFound();
	const payload = await readJsonBody(request);
	const verdict = payload?.verdict;
	if (!VERDICTS.has(verdict)) throw invalid('verdict must be accepted or rejected.');
	const expected = payload?.expectedUpdatedAt ?? null;
	if (expected !== null && (typeof expected !== 'string' || Number.isNaN(Date.parse(expected)))) throw invalid('expectedUpdatedAt must be a timestamp.');
	const access = await deps.pageAccess(request, row.page_id);
	const mayDecide = access.canWrite || (verdict === 'rejected' && row.author_id === session.userId);
	if (!mayDecide) throw httpError('Deciding this suggestion needs edit access.', 403);
	const result = await rest(config, deps.fetchImpl, 'rpc/osionos_decide_suggestion', {
		method: 'POST',
		body: { p_id: commentId, p_decider: session.userId, p_verdict: verdict, p_expected_updated_at: expected },
	});
	if (!result?.ok) {
		const reason = typeof result?.reason === 'string' ? result.reason : 'missing';
		return sendJson(response, REFUSAL_STATUS[reason] ?? 409, { ok: false, reason, status: result?.status ?? null }, config);
	}
	announce(deps, row.page_id, commentId, verdict);
	return sendJson(response, 200, result, config);
}

async function reactionRoute(deps, session, commentId, emojiSegment, method, request, response, config) {
	const emoji = parseEmoji(emojiSegment);
	const row = await commentRow(deps, config, commentId);
	if (!visibleTo(row, session.userId) || row.deleted_at) throw notFound();
	const access = await deps.pageAccess(request, row.page_id);
	if (!levelAtLeast(access.level, 'can_comment')) throw httpError('Reacting on this page is not allowed.', 403);
	if (method === 'PUT') {
		await rest(config, deps.fetchImpl, 'osionos_page_comment_reactions?on_conflict=comment_id,user_id,emoji', {
			method: 'POST',
			body: { comment_id: commentId, user_id: session.userId, emoji },
			prefer: 'resolution=ignore-duplicates,return=minimal',
		});
	} else {
		await rest(config, deps.fetchImpl,
			`osionos_page_comment_reactions?comment_id=eq.${commentId}&user_id=eq.${session.userId}&emoji=eq.${encodeURIComponent(emoji)}`,
			{ method: 'DELETE', prefer: 'return=minimal' });
	}
	if (row.moderation_state !== 'held') announce(deps, row.page_id, commentId, 'reaction');
	return sendJson(response, 200, { ok: true }, config);
}

/**
 * `/api/comments/:id/decision` and `/api/comments/:id/reactions/:emoji`; false for any
 * other path, so bridge-comments keeps its own routes.
 */
export async function handleDiscussionRoute(deps, session, url, method, request, response, config) {
	const decision = /^\/api\/comments\/([0-9a-fA-F-]{36})\/decision$/.exec(url.pathname);
	const reaction = /^\/api\/comments\/([0-9a-fA-F-]{36})\/reactions\/([^/]+)$/.exec(url.pathname);
	if (!decision && !reaction) return false;
	await requireDiscussions(deps, config);
	if (decision && method === 'POST') return decideRoute(deps, session, decision[1], request, response, config);
	if (reaction && (method === 'PUT' || method === 'DELETE')) {
		return reactionRoute(deps, session, reaction[1], reaction[2], method, request, response, config);
	}
	throw notFound();
}
