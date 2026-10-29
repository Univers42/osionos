/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-moderation-console.mjs                        :+:      :+:    :+:   */
/*                                                    +#+ +#+         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE CONSOLE — what an admin reviews (the comments L0 held, the reports users
 * filed) and what an admin decides.
 *
 * C86 — the CONTENT is never touched: a hide sets the soft state ('removed'), a
 *       restore sets it back ('visible'). Nothing is DELETED here: the delete paths
 *       of the comment tables CASCADE to the replies — a moderation takes no thread.
 * C91 — the session's `isAdmin` claim is a HINT: it is read at sign-in and lives up
 *       to an hour, so a demoted admin keeps it. Every call RE-READS
 *       osionos_bridge_identities and refuses unless the row says `is_admin` is
 *       exactly true. A failed read is a 503 — fail closed, never "allowed".
 *       The rule itself now lives in bridge-admin-check.mjs, shared with the
 *       recs health: this console's answers do not change.
 * C92 — an admin reading a user's words is audited: the item route records one
 *       'view' row (layer 'admin', the admin as the actor) BEFORE it answers.
 *
 * THE QUEUE NEVER CARRIES CONTENT: a held row says the kind, the time, the reason
 * codes and the scores. The words come from the item route, the one that audits.
 *
 * THE FLAG. OSIONOS_MODERATION_STATE=1 says the state column and the audit table
 * exist. Without it the console never names moderation_state and never writes
 * ai_moderation_events: the held list is empty, a hide or a restore is a 409
 * (moderation_state_disabled), and the item route answers with an empty audit.
 *
 * Routes (each one: a session, an admin claim, a token of the caller's bucket,
 * and the database's own answer):
 *   GET  /api/admin/moderation/queue     { reports, held }
 *   GET  /api/admin/moderation/item      { content, state, authorId, createdAt, audit }
 *   POST /api/admin/moderation/decision  { kind, id, decision, reason? }
 */

import { requireAdmin } from './bridge-admin-check.mjs';
import { recordDecision } from './bridge-moderation-gate.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { reportEntry } from './bridge-reports.mjs';
import { UUID_REGEX, bearerToken, moderationSettings, readJsonBody, rest, safeText, sendJson } from './bridge-social-core.mjs';

/** The two comment tables, by the kind the console speaks. */
const COMMENT_TABLES = Object.freeze({
	feed_comment: 'osionos_feed_comments',
	page_comment: 'osionos_page_comments',
});

/** The reasons an admin may give, from a closed list. */
const REASON_CODES = Object.freeze([
	'spam', 'harassment', 'hate', 'sexual', 'violence',
	'self_harm', 'illegal', 'other', 'report_unfounded',
]);

/** The routes this module owns, and the method each one answers. */
const ROUTES = Object.freeze({
	'/api/admin/moderation/queue': 'GET',
	'/api/admin/moderation/item': 'GET',
	'/api/admin/moderation/decision': 'POST',
});

// Sixty calls a minute, per admin, burst included.
const RATE = { capacity: 60, refillPerSec: 1 };
// How many rows a list answers: the queue, and the audit of one subject.
const QUEUE_LIMIT = 50;
const AUDIT_LIMIT = 20;

/** An error the console answers itself: a status and a code the client reads. */
const consoleError = (message, status, code) => Object.assign(new Error(message), { status, code });

/** The audit rows of a subject, the last ones first. */
async function readAudit(deps, config, query, limit = AUDIT_LIMIT) {
	const rows = await rest(config, deps.fetchImpl, `ai_moderation_events?${query}&order=ts.desc&limit=${limit}`);
	return (Array.isArray(rows) ? rows : []).map((row) => ({
		ts: row.ts ?? null, layer: row.layer ?? null, action: row.action ?? null,
		reason: row.reason ?? null, scores: row.scores ?? null,
		subject_kind: row.subject_kind ?? null, subject_id: row.subject_id ?? null,
	}));
}

/** The held comments of both tables — NO content — with the LATEST audit row of each. */
async function readHeldComments(deps, config) {
	const items = [];
	for (const [subjectKind, table] of Object.entries(COMMENT_TABLES)) {
		const rows = await rest(config, deps.fetchImpl, `${table}?moderation_state=eq.held&select=id,author_id,created_at,moderation_changed_at&order=created_at.desc&limit=${QUEUE_LIMIT}`);
		for (const row of Array.isArray(rows) ? rows : []) {
			items.push({ subjectKind, id: row.id, authorId: row.author_id ?? null, createdAt: row.created_at ?? null, moderationChangedAt: row.moderation_changed_at ?? null });
		}
	}
	if (items.length === 0) return items;
	const ids = items.map((item) => item.id).filter(Boolean);
	// The kinds are named too: the audit's index leads with subject_kind.
	const kinds = Object.keys(COMMENT_TABLES).join(',');
	const rows = await readAudit(deps, config, `subject_kind=in.(${kinds})&subject_id=in.(${ids.join(',')})&select=subject_kind,subject_id,layer,action,reason,scores`, QUEUE_LIMIT * 4);
	const latest = new Map();
	for (const row of rows) {
		const key = `${row.subject_kind}:${row.subject_id}`;
		if (row.subject_id && !latest.has(key)) latest.set(key, { layer: row.layer, action: row.action, reason: row.reason, scores: row.scores });
	}
	return items.map((item) => ({ ...item, audit: latest.get(`${item.subjectKind}:${item.id}`) ?? null }));
}

/** One comment, by its kind and its id. The content comes only from here. */
async function readComment(deps, config, subjectKind, id, select) {
	const rows = await rest(config, deps.fetchImpl, `${COMMENT_TABLES[subjectKind]}?id=eq.${id}&select=${select}&limit=1`);
	return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** The item: the content of one comment, and the audit that says what happened to it. */
async function readItem(deps, config, session, url, stateEnabled) {
	const subjectKind = safeText(url.searchParams.get('kind'), 32);
	if (!COMMENT_TABLES[subjectKind]) throw consoleError('Unknown moderation kind.', 422, 'unknown_kind');
	const id = safeText(url.searchParams.get('id'), 80);
	if (!UUID_REGEX.test(id)) throw consoleError('id must be a UUID.', 422, 'invalid_id');
	const select = stateEnabled ? 'id,content,moderation_state,author_id,created_at' : 'id,content,author_id,created_at';
	const row = await readComment(deps, config, subjectKind, id, select);
	if (!row) throw consoleError('Not found.', 404, 'not_found');
	// C92: the reading is audited BEFORE the answer, and a reading that could not
	// be audited is not answered at all — the console never hands out a user's
	// words the audit knows nothing about.
	if (stateEnabled) {
		const recorded = await recordDecision(config, deps.fetchImpl, {
			subjectKind, subjectId: row.id, authorId: row.author_id ?? null,
			action: 'view', content: row.content ?? '', layer: 'admin', actorId: session.userId,
		});
		if (!recorded) throw consoleError('The reading could not be audited.', 503, 'audit_failed');
	}
	const audit = stateEnabled ? await readAudit(deps, config, `subject_kind=eq.${subjectKind}&subject_id=eq.${row.id}&select=ts,layer,action,reason,scores`) : [];
	return {
		content: row.content ?? '', state: row.moderation_state ?? 'visible',
		authorId: row.author_id ?? null, createdAt: row.created_at ?? null, audit,
	};
}

/** A report's own answer: its status IS the record, so there is no audit row. */
async function decideReport(deps, config, id, decision) {
	if (decision !== 'dismiss' && decision !== 'resolve') throw consoleError('Unknown decision.', 422, 'unknown_decision');
	if (!UUID_REGEX.test(id)) throw consoleError('id must be a UUID.', 422, 'invalid_id');
	const rows = await rest(config, deps.fetchImpl, `osionos_user_reports?id=eq.${id}&select=id,status&limit=1`);
	const row = Array.isArray(rows) ? rows[0] : null;
	if (!row) throw consoleError('Not found.', 404, 'not_found');
	const status = decision === 'dismiss' ? 'dismissed' : 'resolved';
	await rest(config, deps.fetchImpl, `osionos_user_reports?id=eq.${id}`, { method: 'PATCH', body: { status }, prefer: 'return=minimal' });
	return { ok: true, kind: 'report', id, decision, status };
}

/**
 * A decision on a comment: hide it, or restore it. C86: the CONTENT is never
 * touched — the state moves and the row stays, and the audit says who decided.
 */
async function decideComment(deps, config, session, subjectKind, id, decision, reason, stateEnabled) {
	if (decision !== 'hide' && decision !== 'restore') throw consoleError('Unknown decision.', 422, 'unknown_decision');
	if (!UUID_REGEX.test(id)) throw consoleError('id must be a UUID.', 422, 'invalid_id');
	// Without the state column there is nothing to decide: a refusal, not a write.
	if (!stateEnabled) throw consoleError('The moderation state is not enabled.', 409, 'moderation_state_disabled');
	const row = await readComment(deps, config, subjectKind, id, 'id,author_id,content');
	if (!row) throw consoleError('Not found.', 404, 'not_found');
	const hidden = decision === 'hide';
	const table = COMMENT_TABLES[subjectKind];
	await rest(config, deps.fetchImpl, `${table}?id=eq.${id}`, {
		method: 'PATCH',
		body: { moderation_state: hidden ? 'removed' : 'visible', moderation_changed_at: new Date().toISOString() },
		prefer: 'return=minimal',
	});
	await recordDecision(config, deps.fetchImpl, {
		subjectKind, subjectId: row.id, authorId: row.author_id ?? null,
		action: hidden ? 'remove' : 'restore', content: row.content ?? '',
		layer: 'admin', actorId: session.userId, reason,
	});
	if (hidden) {
		// The reports about this subject are answered by the answer.
		await rest(config, deps.fetchImpl, `osionos_user_reports?subject_kind=eq.${subjectKind}&subject_id=eq.${id}&status=in.(open,reviewing)`, { method: 'PATCH', body: { status: 'resolved' }, prefer: 'return=minimal' });
	}
	return { ok: true, kind: subjectKind, id, decision, state: hidden ? 'removed' : 'visible' };
}

/**
 * Build the /api/admin/moderation dispatcher: `await handler(url, request,
 * response)` → true when handled. deps: { config, verifySession, fetchImpl?, env? }.
 */
export function createModerationConsoleHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
	const deps = { fetchImpl, env };
	return async function handleModerationConsoleRoute(url, request, response, requestConfig = config) {
		const expected = ROUTES[url.pathname];
		if (!expected) return false;
		const method = (request.method || 'GET').toUpperCase();
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			// C91: the claim first (a caller with no claim never reaches the
			// database at all), then the row: the database decides, every call.
			await requireAdmin(deps, requestConfig, session);
			// The limit is charged before ANY read: a burst must not be free.
			takeToken(`modconsole:${session.userId}`, RATE);
			const { stateEnabled } = moderationSettings(deps.env);
			if (method !== expected) {
				return sendJson(response, 405, { ok: false, code: 'method_not_allowed', message: `Method ${method} is not supported here.` }, requestConfig);
			}
			if (url.pathname === '/api/admin/moderation/queue') {
				const rows = await rest(requestConfig, deps.fetchImpl, `osionos_user_reports?status=in.(open,reviewing)&select=*&order=created_at.desc&limit=${QUEUE_LIMIT}`);
				const reports = (Array.isArray(rows) ? rows : []).map((row) => ({ ...reportEntry(row), reporterId: row.reporter_id ?? null }));
				// Without the state column there is no held comment to show.
				const held = stateEnabled ? await readHeldComments(deps, requestConfig) : [];
				return sendJson(response, 200, { reports, held }, requestConfig);
			}
			if (url.pathname === '/api/admin/moderation/item') {
				return sendJson(response, 200, await readItem(deps, requestConfig, session, url, stateEnabled), requestConfig);
			}
			const payload = await readJsonBody(request);
			const kind = safeText(payload?.kind, 32);
			const id = safeText(payload?.id, 80);
			const decision = safeText(payload?.decision, 32);
			const reason = payload?.reason ? safeText(payload.reason, 32) : null;
			if (reason !== null && !REASON_CODES.includes(reason)) throw consoleError('Unknown reason.', 422, 'unknown_reason');
			if (kind !== 'report' && !COMMENT_TABLES[kind]) throw consoleError('Unknown moderation kind.', 422, 'unknown_kind');
			const answer = kind === 'report'
				? await decideReport(deps, requestConfig, id, decision)
				: await decideComment(deps, requestConfig, session, kind, id, decision, reason, stateEnabled);
			return sendJson(response, 200, answer, requestConfig);
		} catch (error) {
			const status = error?.status ?? 500;
			const code = error?.code ?? 'moderation_console_failed';
			const message = error instanceof Error ? error.message : 'The moderation console failed.';
			return sendJson(response, status, { ok: false, code, message }, requestConfig);
		}
	};
}
