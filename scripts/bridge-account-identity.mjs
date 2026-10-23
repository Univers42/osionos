/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-account-identity.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The two writes of the account plane that a step-up proof gates: the username change
 * and the deletion request. Both are irreversible enough to need a recent
 * authentication, and both leave an audit row before they do anything.
 *
 * The username goes through ONE SQL function, `osionos_account_change_username(text)`
 * (root WP P1-2s): it updates the typed profile and the legacy identity row in one
 * transaction, so a half-done rename is impossible and the legacy sync trigger cannot
 * undo it. The legacy route refuses `username` now, so this is the only way to write a
 * name.
 *
 * A name that another account holds and a name the history still holds are refused the
 * same way, with the same body: an answer that told them apart would be an oracle for
 * who holds what.
 *
 * The deletion request is a row, not an action: the database owns the fourteen-day
 * grace and the schedule, and nothing here executes a deletion (bridge-account-erasure.mjs
 * does). Cancelling it needs no proof — undoing a request is protective, like cutting a session.
 *
 * The plumbing this module shares with the other account-plane routes (the error shape,
 * the caller session, the audit metadata) lives with the sudo module, because these
 * routes sit behind its proof.
 */

import { rateLimit, requireSudo, writeAudit } from './bridge-guard.mjs';
import { UUID_REGEX, sendJson } from './bridge-social-core.mjs';
import { accountError, callerSession, clientMetaOf, noContent, readBody, respondWithError } from './bridge-account-sudo.mjs';

const USERNAME_PATH = '/api/account/username';
const DELETION_PATH = '/api/account/deletion';
const ACCEPT_PATH = '/api/account/deletion/successor/accept';
const REQUESTS_TABLE = 'osionos_account_deletion_requests';
const SUCCESSOR_NOTICE = 'A workspace owner named you as the successor of their workspaces. You may accept from your account.';
const USERNAME_LIMIT = 3;
const USERNAME_WINDOW_MS = 24 * 60 * 60 * 1000;
const USERNAME_SHAPE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{2,31}$/;
const DELETION_COLUMNS = 'user_id,requested_at,scheduled_for,successor_user_id';
const PLANE_DOWN = 'The account plane is unavailable; try again shortly.';
const NOT_AVAILABLE = 'That name is not available.';
const INVALID_NAME = 'That name is not a valid username.';
const BAD_SUCCESSOR = 'That successor is not a member of a workspace you own.';

/** The name the caller asked for, or the 422 a name the database would refuse gets. */
function readUsername(body) {
	const value = typeof body?.username === 'string' ? body.username : '';
	if (!USERNAME_SHAPE.test(value)) throw accountError(422, 'invalid_username', INVALID_NAME);
	return value;
}

/**
 * The failure of the write, in the words of the caller. 23505 is one answer for a name
 * that is taken and a name that is held, so the body is the same for the two.
 */
function writeFailure(error) {
	const upstream = String(error?.upstreamCode ?? '');
	if (upstream === '23505') return accountError(409, 'username_unavailable', NOT_AVAILABLE);
	if (upstream === '23514' || upstream === '22023') return accountError(422, 'invalid_username', INVALID_NAME);
	return accountError(503, 'account_plane_unavailable', PLANE_DOWN);
}

async function changeUsername({ pg, kv }, session, request, response, config) {
	await requireSudo(kv, session);
	await rateLimit(kv, ['account-username', session.userId], { limit: USERNAME_LIMIT, windowMs: USERNAME_WINDOW_MS });
	const username = readUsername(await readBody(request));
	await writeAudit(pg, {
		session,
		meta: clientMetaOf(request, config),
		eventType: 'account.username_changed',
		details: { username },
	});
	let result;
	try {
		result = await pg.asUser(session).rpc('osionos_account_change_username', { p_username: username });
	} catch (error) {
		throw writeFailure(error);
	}
	return sendJson(response, 200, { username: typeof result === 'string' ? result : username }, config);
}

/** The caller's own deletion request, or null. */
async function readDeletionRow(pg, session) {
	const params = new URLSearchParams({ user_id: `eq.${session.userId}`, select: DELETION_COLUMNS, limit: '1' });
	const rows = await pg.asUser(session).get(`osionos_account_deletion_requests?${params}`);
	return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/** The successor of the request: a user id, or null when there is none. */
function readSuccessor(body, session) {
	const raw = body?.successorUserId;
	if (raw === undefined || raw === null || raw === '') return null;
	const value = String(raw).trim().toLowerCase();
	if (!UUID_REGEX.test(value)) throw accountError(422, 'invalid_successor', 'That successor is not a user id.');
	if (value === session.userId.toLowerCase()) throw accountError(422, 'invalid_successor', 'The successor cannot be this account.');
	return value;
}

/**
 * The successor must be a member of a workspace the caller OWNS: a stranger cannot be
 * handed the account of somebody else.
 */
async function assertSuccessor(pg, session, successor) {
	try {
		const owned = await pg.asService().get(`osionos_workspaces?owner_id=eq.${session.userId}&select=id&limit=100`);
		const ids = (Array.isArray(owned) ? owned : []).map((row) => String(row?.id ?? '')).filter((id) => UUID_REGEX.test(id));
		if (ids.length === 0) throw accountError(422, 'invalid_successor', BAD_SUCCESSOR);
		const members = await pg.asService().get(`osionos_workspace_members?workspace_id=in.(${ids.join(',')})&user_id=eq.${successor}&select=user_id&limit=1`);
		if (!Array.isArray(members) || members.length === 0) throw accountError(422, 'invalid_successor', BAD_SUCCESSOR);
	} catch (error) {
		if (error?.status === 422) throw error;
		throw accountError(503, 'account_plane_unavailable', PLANE_DOWN);
	}
}

/**
 * Tells the successor a request names them. The text carries no id and no name of the
 * requester. Best effort: the request already exists and is audited.
 */
async function notifySuccessor(pg, successor) {
	try {
		await pg.asService().post('osionos_notifications', { user_id: successor, type: 'system', actor_id: null, preview: SUCCESSOR_NOTICE }, { prefer: 'return=minimal' });
	} catch {
		// Caveat: a lost notice leaves the successor unaware; acceptance is API-only anyway.
	}
}

async function requestDeletion({ pg, kv }, session, request, response, config) {
	await requireSudo(kv, session);
	const successor = readSuccessor(await readBody(request), session);
	const existing = await readDeletionRow(pg, session);
	if (existing) {
		throw accountError(409, 'deletion_already_requested', 'A deletion request is already open for this account.', {
			requestedAt: existing.requested_at ?? null,
			scheduledFor: existing.scheduled_for ?? null,
		});
	}
	if (successor) await assertSuccessor(pg, session, successor);
	await writeAudit(pg, {
		session,
		meta: clientMetaOf(request, config),
		eventType: 'account.deletion_requested',
		details: { hasSuccessor: Boolean(successor) },
	});
	let rows;
	try {
		rows = await pg.asUser(session).post('osionos_account_deletion_requests', {
			user_id: session.userId,
			successor_user_id: successor,
		}, { prefer: 'return=representation' });
	} catch (error) {
		// Two requests at once: the second one finds the row the first one wrote.
		if (String(error?.upstreamCode) === '23505') {
			const current = await readDeletionRow(pg, session);
			throw accountError(409, 'deletion_already_requested', 'A deletion request is already open for this account.', {
				requestedAt: current?.requested_at ?? null,
				scheduledFor: current?.scheduled_for ?? null,
			});
		}
		throw accountError(503, 'account_plane_unavailable', PLANE_DOWN);
	}
	const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
	if (successor) await notifySuccessor(pg, successor);
	return sendJson(response, 201, {
		requestedAt: row?.requested_at ?? null,
		scheduledFor: row?.scheduled_for ?? null,
	}, config);
}

/** Erased means the executor passed the point of no return; the account role cannot read it. */
async function readInProgress(pg, session) {
	const rows = await pg.asService().get(`${REQUESTS_TABLE}?user_id=eq.${session.userId}&select=erased_at&limit=1`);
	return Array.isArray(rows) && rows.length > 0 && Boolean(rows[0]?.erased_at);
}

async function readDeletion({ pg }, session, response, config) {
	let row;
	let inProgress;
	try {
		row = await readDeletionRow(pg, session);
		inProgress = row ? await readInProgress(pg, session) : false;
	} catch {
		throw accountError(503, 'account_plane_unavailable', PLANE_DOWN);
	}
	if (!row) throw accountError(404, 'deletion_not_found', 'This account has no deletion request.');
	return sendJson(response, 200, {
		requestedAt: row.requested_at ?? null,
		scheduledFor: row.scheduled_for ?? null,
		successorUserId: row.successor_user_id ?? null,
		inProgress,
	}, config);
}

async function cancelDeletion({ pg }, session, request, response, config) {
	await writeAudit(pg, {
		session,
		meta: clientMetaOf(request, config),
		eventType: 'account.deletion_cancelled',
		details: {},
	});
	try {
		await pg.asUser(session).del(`osionos_account_deletion_requests?user_id=eq.${session.userId}`, { prefer: 'return=minimal' });
	} catch (error) {
		// The guard trigger refuses the account role once the erase stamped the row.
		if (String(error?.upstreamText ?? '').includes('deletion_in_progress')) {
			throw accountError(409, 'deletion_in_progress', 'The deletion is already running and can no longer be cancelled.');
		}
		throw accountError(503, 'account_plane_unavailable', PLANE_DOWN);
	}
	return noContent(response, config);
}

/**
 * The named successor accepts. Not-the-successor and no-such-request answer the same 403,
 * so the route is no oracle for who has a request. Sudo is not needed: accepting hands the
 * caller work, not power over their own account.
 */
async function acceptSuccessor({ pg }, session, request, response, config) {
	const requester = String((await readBody(request))?.requesterUserId ?? '').trim().toLowerCase();
	if (!UUID_REGEX.test(requester)) throw accountError(422, 'invalid_requester', 'That is not a user id.');
	const notSuccessor = accountError(403, 'not_successor', 'You are not the successor of this request.');
	let row;
	try {
		const rows = await pg.asService().get(`${REQUESTS_TABLE}?user_id=eq.${requester}&select=successor_user_id,erased_at&limit=1`);
		row = Array.isArray(rows) ? rows[0] : null;
	} catch {
		throw accountError(503, 'account_plane_unavailable', PLANE_DOWN);
	}
	if (!row || String(row.successor_user_id ?? '').toLowerCase() !== session.userId.toLowerCase()) throw notSuccessor;
	if (row.erased_at) throw accountError(409, 'deletion_in_progress', 'The deletion is already running.');
	await writeAudit(pg, { session, meta: clientMetaOf(request, config), eventType: 'account.successor_accepted', details: { requesterUserId: requester } });
	let written;
	try {
		written = await pg.asService().patch(
			`${REQUESTS_TABLE}?user_id=eq.${requester}&successor_user_id=eq.${session.userId}&erased_at=is.null`,
			{ successor_accepted_at: new Date().toISOString() },
			{ prefer: 'return=representation' },
		);
	} catch {
		throw accountError(503, 'account_plane_unavailable', PLANE_DOWN);
	}
	if (!Array.isArray(written) || written.length === 0) throw accountError(409, 'deletion_in_progress', 'The deletion is already running.');
	return sendJson(response, 200, { accepted: true }, config);
}

/**
 * The account routes of this module: POST /api/account/username and the three
 * /api/account/deletion ones. It answers true when it handled the request and false
 * when the path is not its own.
 */
export function createAccountIdentityRoutes({ config, pg, kv, verifySession }) {
	return async function handleAccountIdentity(url, request, response) {
		const pathname = url.pathname;
		const method = (request.method || 'GET').toUpperCase();
		const isUsername = pathname === USERNAME_PATH;
		if (!isUsername && pathname !== DELETION_PATH && pathname !== ACCEPT_PATH) return false;
		try {
			const session = callerSession(request, config, verifySession);
			if (isUsername) {
				if (method !== 'POST') throw accountError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);
				return await changeUsername({ pg, kv }, session, request, response, config);
			}
			if (pathname === ACCEPT_PATH) {
				if (method !== 'POST') throw accountError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);
				return await acceptSuccessor({ pg }, session, request, response, config);
			}
			if (method === 'POST') return await requestDeletion({ pg, kv }, session, request, response, config);
			if (method === 'GET') return await readDeletion({ pg }, session, response, config);
			if (method === 'DELETE') return await cancelDeletion({ pg }, session, request, response, config);
			throw accountError(405, 'method_not_allowed', `Method ${method} is not supported on this route.`);
		} catch (error) {
			return respondWithError(response, error, config);
		}
	};
}
