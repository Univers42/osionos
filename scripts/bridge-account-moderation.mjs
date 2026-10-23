/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-moderation.mjs                      +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The moderation queue: GET /api/account/admin/reports (a keyset page of reports by status)
 * and POST /api/account/admin/reports/:id/decision (warn, suspend, ban or dismiss one).
 * It also owns assertAccountNotRefused, the ONE function every sign-in path asks.
 *
 * Who may call: a session whose platform role, re-read from the grants on every request, is
 * at least moderator. The role claim in the token never grants. Reports are only opened by
 * the person who files them (no case-opening route here, D-P3-4s 14).
 *
 * The state of a person is the most severe LIVE decision on a report about them (D-P3-4s 10):
 * a ban beats a suspension, a suspension is live while `until` is ahead, and only the same
 * report re-decided to dismiss lifts one. Only subject_kind 'user' reports move a person
 * (D-P3-4s 11); a decision on a message revokes no session and changes no sign-in answer.
 *
 * Every decision records an audit row first. No audit row, no decision.
 *
 * Caveat: the sign-in refusal is a best-effort read with a short timeout and fails OPEN: if
 * the reports table cannot be read, a banned person can still sign in until it can. The
 * decision itself revoked their sessions, so the gap is only a new sign-in during an outage.
 * Caveat: the refusal reads at most 100 decisions about one person; a person with more live
 * decisions than that is judged on the first 100 the database returns.
 * Caveat: the warn notice is a plain `system` row; the inbox cannot tell it from other
 * system notices, so it cannot be filtered out.
 * Caveat: the audit row records an attempt; a failure after it leaves a row for a decision
 * that did not land.
 */

import { clientMeta, rateLimit, writeAudit } from './bridge-guard.mjs';
import { decodeCursor, inFilter, keyset, pageOf } from './bridge-paging.mjs';
import { readPlatformRole, roleAtLeast } from './bridge-roles.mjs';
import { timestampMicros } from './bridge-session-tracker.mjs';
import { UUID_REGEX, bearerToken, readJsonBody, sendJson } from './bridge-social-core.mjs';

const REPORTS_PATH = '/api/account/admin/reports';
const REPORTS = 'osionos_user_reports';
const COLUMNS = ['id', 'reporter_id', 'subject_user_id', 'subject_kind', 'subject_id', 'category', 'details', 'status', 'decision', 'decision_until', 'decision_by', 'decision_at', 'created_at'];
const SELECT = COLUMNS.join(',');
const ORDER = [['created_at', 'desc'], ['id', 'desc']];
const STATUSES = new Set(['open', 'reviewing', 'resolved', 'dismissed']);
const DECISIONS = new Set(['warn', 'suspend', 'ban', 'dismiss']);
const READ_LIMIT = 60;
const WRITE_LIMIT = 30;
const WINDOW_MS = 60_000;
const MAX_NOTE = 500;
const MAX_SUSPEND_MS = 30 * 86_400_000;
const REFUSAL_READ_LIMIT = 100;
const REFUSAL_TIMEOUT_MS = 2_000;
const NOTICE = {
	warn: 'A moderator reviewed a report about your account and issued a warning.',
};

function moderationError(status, code, message) {
	return Object.assign(new Error(message), { status, code });
}

/**
 * Throws 403 account_banned / account_suspended when the person has a live ban or suspension.
 * `client` is a PostgREST service reader; none, or a failing read, lets the sign-in through.
 */
export async function assertAccountNotRefused(client, userId, now = Date.now()) {
	if (!client || typeof client.get !== 'function' || !UUID_REGEX.test(String(userId ?? ''))) return;
	let rows;
	let timer;
	try {
		const read = client.get(`${REPORTS}?subject_user_id=eq.${String(userId).toLowerCase()}&subject_kind=eq.user&decision=in.(ban,suspend)&select=decision,decision_until&limit=${REFUSAL_READ_LIMIT}`);
		const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('moderation read timed out')), REFUSAL_TIMEOUT_MS); });
		rows = await Promise.race([read, timeout]);
	} catch {
		console.warn(`[osionos-bridge] moderation: the refusal read failed for ${userId}; the sign-in is not refused`);
		return;
	} finally {
		clearTimeout(timer);
	}
	const live = (Array.isArray(rows) ? rows : []).filter((row) => row?.decision === 'ban' || row?.decision === 'suspend');
	if (live.some((row) => row.decision === 'ban')) throw moderationError(403, 'account_banned', 'This account has been banned.');
	const ends = live.map((row) => (row.decision_until ? Date.parse(row.decision_until) : Infinity)).filter((end) => end > now);
	if (ends.length === 0) return;
	const until = Math.max(...ends);
	const suffix = Number.isFinite(until) ? ` until ${new Date(until).toISOString()}` : '';
	throw moderationError(403, 'account_suspended', `This account is suspended${suffix}.`);
}

function requestMeta(request, config) {
	const meta = clientMeta(request, { ipHeader: config.clientIpHeader, hashSecret: config.ipHashSecret });
	if (!config.clientIpHeader) Object.assign(meta, { ipPrefix: null, ipHash: null });
	return meta;
}

async function readBody(request) {
	let body;
	try {
		body = await readJsonBody(request);
	} catch (error) {
		if (error?.status === 400) throw moderationError(422, 'invalid_body', 'The request body must be a JSON object.');
		throw error;
	}
	if (typeof body !== 'object' || body === null || Array.isArray(body)) throw moderationError(422, 'invalid_body', 'The request body must be a JSON object.');
	return body;
}

async function throttle({ kv, config }, parts, limit, response) {
	try {
		await rateLimit(kv, parts, { limit, windowMs: WINDOW_MS });
	} catch (error) {
		if (error?.status !== 429) throw error;
		const retryAfterSeconds = Number.isFinite(error?.retryAfterSeconds) ? error.retryAfterSeconds : WINDOW_MS / 1_000;
		response.setHeader('retry-after', String(retryAfterSeconds));
		sendJson(response, 429, { ok: false, message: 'Too many requests.', code: 'rate_limited', retryAfterSeconds }, config);
		return true;
	}
	return false;
}

function reportEntry(row, names) {
	return {
		id: row.id,
		reporterId: row.reporter_id,
		subjectUserId: row.subject_user_id,
		subjectName: names.get(row.subject_user_id) ?? null,
		subjectKind: row.subject_kind,
		subjectId: row.subject_id,
		category: row.category,
		details: row.details ?? null,
		status: row.status,
		decision: row.decision ?? null,
		decisionUntil: row.decision_until ?? null,
		decisionBy: row.decision_by ?? null,
		decisionAt: row.decision_at ?? null,
		createdAt: row.created_at,
	};
}

async function displayNames(client, ids) {
	if (ids.length === 0) return new Map();
	const rows = await client.get(`osionos_profiles?${inFilter('user_id', ids)}&select=user_id,display_name`);
	return new Map((Array.isArray(rows) ? rows : []).map((row) => [row.user_id, row.display_name]));
}

async function listReports(ctx, url, response) {
	const { client, config } = ctx;
	const status = url.searchParams.get('status') ?? 'open';
	if (!STATUSES.has(status)) throw moderationError(422, 'invalid_status', 'The status must be open, reviewing, resolved or dismissed.');
	const rawCursor = url.searchParams.get('cursor');
	const cursor = rawCursor ? decodeCursor(rawCursor, ORDER.length) : undefined;
	const { query, take } = keyset({ order: ORDER, cursor, limit: url.searchParams.get('limit') });
	const rows = await client.get(`${REPORTS}?select=${SELECT}&status=eq.${status}&${query}`);
	const page = pageOf(Array.isArray(rows) ? rows : [], ORDER, take);
	const names = await displayNames(client, [...new Set(page.items.map((row) => row.subject_user_id))]);
	return sendJson(response, 200, { ok: true, reports: page.items.map((row) => reportEntry(row, names)), nextCursor: page.nextCursor }, config);
}

/** The decision the body asks for, as the columns it writes. Every refusal here is a 422. */
function parseDecision(body, now) {
	const { decision, note, until } = body;
	if (!DECISIONS.has(decision)) throw moderationError(422, 'invalid_decision', 'The decision must be warn, suspend, ban or dismiss.');
	if (note !== undefined && (typeof note !== 'string' || note.length > MAX_NOTE)) throw moderationError(422, 'invalid_note', `The note must be text of at most ${MAX_NOTE} characters.`);
	let end = null;
	if (decision === 'suspend') {
		end = typeof until === 'string' ? Date.parse(until) : NaN;
		if (!Number.isFinite(end) || end <= now || end > now + MAX_SUSPEND_MS) throw moderationError(422, 'invalid_until', 'A suspension needs an end within the next 30 days.');
	} else if (until !== undefined && until !== null) {
		throw moderationError(422, 'invalid_until', 'Only a suspension has an end.');
	}
	return { decision, note: note ?? null, until: end === null ? null : new Date(end).toISOString() };
}

async function targetIsAdmin(client, userId) {
	if ((await readPlatformRole(client, userId)).role === 'admin') return true;
	const rows = await client.get(`osionos_bridge_identities?user_id=eq.${userId}&select=is_admin&limit=1`).catch(() => []);
	return Array.isArray(rows) && rows[0]?.is_admin === true;
}

async function revokeSessions({ client, config }, userId) {
	const rows = await client.patch(
		`osionos_sessions?user_id=eq.${userId}&revoked_at=is.null&select=id,expires_at`,
		{ revoked_at: new Date().toISOString(), revoked_reason: 'admin' },
		{ prefer: 'return=representation' },
	);
	for (const row of Array.isArray(rows) ? rows : []) {
		const id = String(row?.id ?? '').toLowerCase();
		if (id) config.sessionRevocations?.applyLocal(id, timestampMicros(row?.expires_at) ?? 0);
	}
}

async function decide(ctx, request, reportId, response) {
	const { client, config, pg, session } = ctx;
	const wanted = parseDecision(await readBody(request), Date.now());
	const found = await client.get(`${REPORTS}?id=eq.${reportId}&select=${SELECT}&limit=1`);
	const row = Array.isArray(found) ? found[0] : null;
	if (!row) throw moderationError(404, 'report_not_found', 'Report not found.');
	if (String(row.reporter_id).toLowerCase() === session.userId.toLowerCase()) throw moderationError(403, 'self_report', 'You cannot decide a report you filed.');
	if (await targetIsAdmin(client, row.subject_user_id)) throw moderationError(403, 'target_is_admin', 'An administrator cannot be moderated here.');
	await writeAudit(pg, {
		session,
		meta: requestMeta(request, config),
		eventType: 'moderation_decision',
		details: { reportId, targetUserId: row.subject_user_id, decision: wanted.decision, until: wanted.until },
	});
	const patch = {
		status: wanted.decision === 'dismiss' ? 'dismissed' : 'resolved',
		decision: wanted.decision,
		decision_until: wanted.until,
		decision_by: session.userId,
		decision_at: new Date().toISOString(),
		decision_note: wanted.note,
	};
	await client.patch(`${REPORTS}?id=eq.${reportId}`, patch, { prefer: 'return=minimal' });
	if (row.subject_kind === 'user') {
		if (wanted.decision === 'suspend' || wanted.decision === 'ban') await revokeSessions(ctx, row.subject_user_id);
		if (wanted.decision === 'warn') await client.post('osionos_notifications', { user_id: row.subject_user_id, type: 'system', actor_id: null, preview: NOTICE.warn }, { prefer: 'return=minimal' });
	}
	return sendJson(response, 200, { ok: true, reportId, decision: wanted.decision, status: patch.status }, config);
}

function reportIdOf(pathname) {
	const raw = pathname.slice(REPORTS_PATH.length + 1, -'/decision'.length);
	let id = '';
	try { id = decodeURIComponent(raw); } catch { /* falls through to the 422 */ }
	if (!UUID_REGEX.test(id)) throw moderationError(422, 'invalid_report_id', 'The report id must be a UUID.');
	return id.toLowerCase();
}

/** The moderation routes. The gate runs first and reads the roles from the database. */
export function createAdminModerationRoutes({ config, pg, kv, verifySession }) {
	return async function handleModeration(url, request, response) {
		const { pathname, method } = { pathname: url.pathname, method: request.method };
		const isList = pathname === REPORTS_PATH;
		const isDecision = pathname.startsWith(`${REPORTS_PATH}/`) && pathname.endsWith('/decision');
		if (!isList && !isDecision) return false;
		if (isList ? method !== 'GET' : method !== 'POST') return false;
		const session = verifySession(bearerToken(request), config);
		const client = pg.asService();
		const { role } = await readPlatformRole(client, session.userId);
		if (!roleAtLeast(role, 'moderator')) throw moderationError(403, 'moderator_required', 'This action needs the moderator role.');
		const ctx = { config, pg, kv, session, client };
		if (await throttle(ctx, ['admin-reports', isList ? 'read' : 'write', session.userId], isList ? READ_LIMIT : WRITE_LIMIT, response)) return true;
		return isList ? listReports(ctx, url, response) : decide(ctx, request, reportIdOf(pathname), response);
	};
}
