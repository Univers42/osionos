/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-reports.mjs                                   :+:      :+:    :+:  */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Abuse reports (GET/POST /api/social/reports) — the server decides WHAT a report
 * names. The routes moved here from bridge-social.mjs (346 lines, over the 300
 * limit); bridge-social.mjs keeps a one-line delegation and gets shorter.
 *
 * The old POST trusted the body: any subjectKind of up to 32 chars (an unknown kind
 * reached PostgREST and failed its CHECK), a subjectUserId the CLIENT chose (so a
 * report could be pinned on any third party), no check that the reporter can even
 * see the subject (an existence oracle and a spam channel), and no rate limit or
 * dedupe (one account filing the same report a thousand times).
 *
 * Now: the kind is one of seven, the subject is resolved server-side (one resolver
 * per kind, each answering { subjectUserId } or null), the reporter must be able to
 * read the subject, the request is rate limited per reporter, and one report per
 * (reporter, subject) is kept. A subject that does not exist and a subject the
 * reporter cannot read answer the SAME 404 — no oracle. A backend failure stays a
 * 5xx: fail closed, never "not found". A report hides nothing: no count of the
 * reports about a subject is ever read or returned.
 */

import { requireChannelAccess } from './bridge-chat.mjs';
import { isAiAnswer } from './bridge-chat-ai.mjs';
import { canReadPageRowAsMember } from './bridge-page-read.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import {
	UUID_REGEX,
	httpError,
	isUniqueViolation,
	memberWorkspacesAmong,
	readJsonBody,
	rest,
	safeText,
	sendJson,
} from './bridge-social-core.mjs';

/**
 * The subject kinds a report may name — the same seven the groot CHECK allows
 * (models/osionos-social-migration.sql: subject_kind IN
 * ('user','message','channel','workspace','page','feed_comment','page_comment')).
 */
export const REPORT_SUBJECT_KINDS = Object.freeze([
	'user',
	'message',
	'channel',
	'workspace',
	'page',
	'feed_comment',
	'page_comment',
]);

/** Ten reports an hour per reporter, the bucket kept for the hour. */
const REPORT_RATE = { capacity: 10, refillPerSec: 10 / 3600, retainMs: 3_600_000 };

/** osionos_user_reports row → the frontend Report shape (store/social/types.ts). */
export function reportEntry(row) {
	return {
		id: row.id,
		subjectUserId: row.subject_user_id ?? undefined,
		subjectKind: row.subject_kind ?? 'user',
		subjectId: row.subject_id ?? undefined,
		category: row.category ?? 'other',
		details: row.details ?? undefined,
		status: row.status ?? undefined,
		createdAt: row.created_at ?? undefined,
	};
}

/** The subject id: a uuid for every kind. */
function subjectIdFor(subjectKind, payload) {
	const subjectId = safeText(payload.subjectId, 80);
	if (UUID_REGEX.test(subjectId)) return subjectId;
	// Legacy: the contact menu (features/connections/ContactContextMenu.tsx) sends a user
	// report as { subjectUserId } with no subjectId. That shape must keep working.
	if (subjectKind === 'user') {
		const legacy = safeText(payload.subjectUserId, 80);
		if (UUID_REGEX.test(legacy)) return legacy;
	}
	throw httpError('subjectId must be a UUID.', 422);
}

/** The directory row of the reported user — the profiles table the bridge reads. */
async function resolveUser(ctx, config, subjectId) {
	const rows = await rest(config, ctx.fetchImpl, `osionos_people_directory?user_id=eq.${subjectId}&select=user_id&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	return row ? { subjectUserId: subjectId } : null;
}

/** The reported message: its author, and a reporter who may read its channel. */
async function resolveMessage(ctx, config, subjectId, session) {
	const rows = await rest(config, ctx.fetchImpl, `osionos_messages?id=eq.${subjectId}&select=*&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row) return null;
	await requireChannelAccess(config, ctx.fetchImpl, session.userId, row.channel_id);
	// A posted AI answer was written by no person, not even its requester (C439).
	return { subjectUserId: isAiAnswer(row) ? null : row.author_id ?? null };
}

/** The reported channel: the reporter must be in it; its creator is the subject. */
async function resolveChannel(ctx, config, subjectId, session) {
	const { channel } = await requireChannelAccess(config, ctx.fetchImpl, session.userId, subjectId);
	return { subjectUserId: channel.created_by ?? null };
}

/** The reported workspace: the reporter is a member of it, or it is public. */
async function resolveWorkspace(ctx, config, subjectId, session) {
	const rows = await rest(config, ctx.fetchImpl, `osionos_workspaces?id=eq.${subjectId}&select=id,owner_id,visibility&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row) return null;
	const memberOf = await memberWorkspacesAmong(config, ctx.fetchImpl, session, [row.id]);
	if (memberOf.length === 0 && row.visibility !== 'public') return null;
	return { subjectUserId: row.owner_id ?? null };
}

/** The reported page: the reporter must be able to read it (the inherited page rule, C550). */
async function resolvePage(ctx, config, subjectId, session) {
	const rows = await rest(config, ctx.fetchImpl, `osionos_pages?id=eq.${subjectId}&select=id,workspace_id,owner_id,visibility,collaborators,archived_at&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row || row.archived_at) return null;
	const memberOf = await memberWorkspacesAmong(config, ctx.fetchImpl, session, [row.workspace_id]);
	if (!canReadPageRowAsMember(row, session.userId, memberOf)) return null;
	const visible = typeof ctx.pageAccessFilter === 'function'
		? await ctx.pageAccessFilter([row], session, config)
		: [row];
	return visible.length === 0 ? null : { subjectUserId: row.owner_id ?? null };
}

/** A comment: its author, on a page the reporter may read (the page rule). */
async function resolveComment(ctx, config, table, subjectId, session) {
	const rows = await rest(config, ctx.fetchImpl, `${table}?id=eq.${subjectId}&select=id,author_id,page_id&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row) return null;
	const page = await resolvePage(ctx, config, row.page_id, session);
	if (!page) return null;
	return { subjectUserId: row.author_id ?? null };
}

async function resolveFeedComment(ctx, config, subjectId, session) {
	return resolveComment(ctx, config, 'osionos_feed_comments', subjectId, session);
}

async function resolvePageComment(ctx, config, subjectId, session) {
	return resolveComment(ctx, config, 'osionos_page_comments', subjectId, session);
}

/** One resolver per kind: { subjectUserId } or null when the subject is not reportable. */
const RESOLVERS = {
	user: resolveUser,
	message: resolveMessage,
	channel: resolveChannel,
	workspace: resolveWorkspace,
	page: resolvePage,
	feed_comment: resolveFeedComment,
	page_comment: resolvePageComment,
};

/**
 * The subject, resolved server-side. A helper that answers 403/404 means "not
 * yours": it becomes the same null as a missing row, so the answer never tells the
 * reporter whether the subject exists. Any other failure (a 5xx from PostgREST)
 * propagates — fail closed, never "not found".
 */
async function resolveSubject(deps, config, session, subjectKind, subjectId) {
	try {
		return await RESOLVERS[subjectKind](deps, config, subjectId, session);
	} catch (error) {
		if (error?.status === 403 || error?.status === 404) return null;
		throw error;
	}
}

/** The report this reporter already filed for this subject, or null. */
async function findReport(config, fetchImpl, reporterId, subjectKind, subjectId) {
	const rows = await rest(
		config,
		fetchImpl,
		`osionos_user_reports?reporter_id=eq.${reporterId}&subject_kind=eq.${subjectKind}&subject_id=eq.${subjectId}&select=*&limit=1`,
	);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** A duplicate answer: the report is already there, so the same 200 as the first. */
function duplicateBody(row) {
	return { ok: true, reportId: row.id, report: reportEntry(row), duplicate: true };
}

/** POST /api/social/reports — file a report about a subject the server can see. */
async function createReport(deps, session, request, response, config) {
	// The rate limit is charged before ANY read: a spammer must not be able to probe
	// the subject graph for free.
	takeToken(`report:${session.userId}`, REPORT_RATE);
	const payload = await readJsonBody(request);
	const subjectKind = safeText(payload.subjectKind, 32) || 'user';
	if (!REPORT_SUBJECT_KINDS.includes(subjectKind)) throw httpError('Unknown report subject.', 422);
	const subjectId = subjectIdFor(subjectKind, payload);
	const subject = await resolveSubject(deps, config, session, subjectKind, subjectId);
	if (!subject) throw httpError('Nothing to report here.', 404);
	const prior = await findReport(config, deps.fetchImpl, session.userId, subjectKind, subjectId);
	if (prior) return sendJson(response, 200, duplicateBody(prior), config);
	let row;
	try {
		const rows = await rest(config, deps.fetchImpl, 'osionos_user_reports', {
			method: 'POST',
			body: {
				reporter_id: session.userId,
				// The server names the subject user: the client's subjectUserId is ignored.
				subject_user_id: subject.subjectUserId ?? null,
				subject_kind: subjectKind,
				subject_id: subjectId,
				category: safeText(payload.category, 64) || 'other',
				details: safeText(payload.details, 2000) || null,
			},
			prefer: 'return=representation',
		});
		row = Array.isArray(rows) ? rows[0] : rows;
	} catch (error) {
		// The unique index (reporter, kind, subject) caught a concurrent duplicate:
		// the same answer as the duplicate read above.
		if (!isUniqueViolation(error)) throw error;
		const again = await findReport(config, deps.fetchImpl, session.userId, subjectKind, subjectId);
		if (!again) throw httpError('Report failed.', 502);
		return sendJson(response, 200, duplicateBody(again), config);
	}
	if (!row) throw httpError('Report failed.', 502);
	return sendJson(response, 201, { ok: true, reportId: row.id, report: reportEntry(row) }, config);
}

/** GET /api/social/reports — the reporter's own reports (moved unchanged). */
async function listReports(deps, session, response, config) {
	const rows = await rest(config, deps.fetchImpl, `osionos_user_reports?reporter_id=eq.${session.userId}&select=*&order=created_at.desc&limit=100`);
	const reports = (Array.isArray(rows) ? rows : []).map(reportEntry);
	return sendJson(response, 200, { ok: true, reports }, config);
}

/** GET/POST /api/social/reports — the report routes, called from bridge-social.mjs. */
export async function handleReportRoutes(deps, session, request, response, config) {
	const method = (request.method || 'GET').toUpperCase();
	if (method === 'GET') return await listReports(deps, session, response, config);
	if (method === 'POST') return await createReport(deps, session, request, response, config);
	return sendJson(response, 404, { ok: false, message: 'Social route not found.' }, config);
}
