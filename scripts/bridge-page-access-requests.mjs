/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-page-access-requests.mjs                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Page access requests: a member who cannot read a page may ask its owner; only the page
 * owner decides. The bridge half of Plan A (verdict 2026-10-28, N1-N12, N15).
 *
 *   POST /api/pages/:id/access-requests       {workspaceId, note?}  -> 202 {ok:true}
 *   GET  /api/access-requests?workspaceId=W   the caller's pending requests, as owner
 *   POST /api/access-requests/:id/approve     {permission, replace?}
 *   POST /api/access-requests/:id/decline
 *
 * The create route answers the SAME 202 bytes for a missing page, an unreadable page, a
 * non-member, a stored request, a duplicate, the cap, a block and an owner who left. The
 * checks and the write run in a detached task AFTER the reply, so timing cannot separate
 * them either; that task's failures are logged, never answered (N3). Rate limits are the
 * only 429s and are taken before any read (N4).
 *
 * The decision re-checks live state in N6's order, writes the grant through the same
 * writeShareRule sequence as POST /api/perms/rules (N7), refuses a silent downgrade (N8),
 * and verifies the grant with a fresh loader (N9). Notifications carry the title/note only
 * in the owner's inbox; a push, and the requester's decision notice, carry neither (N10).
 *
 * Caveat: the owner list reads at most 500 owned pages and answers at most 50 requests.
 * A workspace with more owned pages can hide older requests from the list; the decision
 * routes still reach them by id.
 */

import { bearerToken, httpError, identitySummaries, readJsonBody, safeText, sendJson } from './bridge-social-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { connectionStatus } from './bridge-friendship.mjs';
import { createShareRuleStore } from './bridge-perms-rules.mjs';
import { writeShareRule } from './bridge-perms.mjs';
import { pushToUser } from './bridge-push.mjs';
import { sameId, ownerHoldsPage } from './bridge-page-read.mjs';
import {
	REQUEST_WINDOW_MS,
	expireStale,
	insertNotification,
	insertRequest,
	memberRow,
	ownerMemberRow,
	pageRow,
	pendingCount,
	requestRow,
} from './bridge-page-access-request-store.mjs';
import {
	approve as approveRequest,
	decline as declineRequest,
	listRequests,
} from './bridge-page-access-request-decisions.mjs';

const CREATE_PATH = /^\/api\/pages\/([^/]+)\/access-requests$/;
const DECIDE_PATH = /^\/api\/access-requests\/([^/]+)\/(approve|decline)$/;
const LIST_PATH = '/api/access-requests';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069]/g;
const MAX_NOTE = 280;
const MAX_PENDING = 10;
// Attempts, not rows: 30 an hour per requester and 10 an hour per requester+workspace.
const REQUEST_BUCKET = { capacity: 30, refillPerSec: 30 / 3600, retainMs: 3_600_000 };
const WORKSPACE_BUCKET = { capacity: 10, refillPerSec: 10 / 3600, retainMs: 3_600_000 };
const BLOCKED = 'blocked';

const badRequest = (message) => httpError(message, 400);

function noteText(value) {
	if (value !== undefined && value !== null && typeof value !== 'string') throw badRequest('note must be text.');
	return safeText(String(value ?? '').replaceAll(BIDI_CONTROLS, ''), MAX_NOTE);
}

function workspaceIdFrom(value) {
	const workspaceId = String(value ?? '');
	if (!UUID_RE.test(workspaceId)) throw badRequest('workspaceId must be a UUID.');
	return workspaceId;
}

function logger(log) {
	return (label, error) => log(`[bridge-page-access-requests] ${label}: ${error?.message || error}`);
}

/**
 * N3's detached work: every check, then the insert and the owner's notification. A dropped
 * request leaves nothing behind; a failure here is logged and never reaches the 202.
 */
async function storeRequest(deps, session, workspaceId, pageId, note) {
	const { config, fetchImpl } = deps;
	const log = logger(deps.log);
	try {
		const requester = await memberRow(config, fetchImpl, session.userId, workspaceId);
		if (!requester) return;
		const page = await pageRow(config, fetchImpl, pageId);
		if (!page || !sameId(page.workspace_id, workspaceId)) return;
		const entry = await deps.createPageAccessLoader({ userId: session.userId }, config, fetchImpl).entryFor(page.workspace_id);
		if (deps.pageLevelFor(entry, page, session.userId) !== 'none') return;
		const owner = await ownerMemberRow(config, fetchImpl, page.owner_id, page.workspace_id);
		if (!ownerHoldsPage(page, page.owner_id, owner)) return;
		let status;
		try {
			status = await connectionStatus(config, fetchImpl, session.userId, page.owner_id);
		} catch (error) {
			log('block check failed; request dropped', error);
			return;
		}
		if (status === BLOCKED) return;
		const cutoff = new Date(deps.now() - REQUEST_WINDOW_MS).toISOString();
		await expireStale(config, fetchImpl, session.userId, page.id, cutoff);
		if (await pendingCount(config, fetchImpl, session.userId, workspaceId) >= MAX_PENDING) return;
		const saved = await insertRequest(config, fetchImpl, {
			workspace_id: workspaceId, page_id: page.id, requester_id: session.userId, note: note || null,
			status: 'pending', created_at: new Date(deps.now()).toISOString(),
		});
		if (!saved) return;
		const identities = await identitySummaries(config, fetchImpl, [session.userId]);
		const name = safeText(identities.get(session.userId)?.name ?? 'Member', 120) || 'Member';
		const title = safeText(page.title, 200) || 'Untitled';
		await insertNotification(config, fetchImpl, {
			user_id: page.owner_id, type: 'page_access_request', actor_id: session.userId,
			channel_id: page.id, message_id: saved.id, preview: `${name} requested access to ${title}`.slice(0, 280),
		});
		await deps.push(config, fetchImpl, page.owner_id, JSON.stringify({
			title: 'New access request', body: 'New access request', url: '/',
		}));
	} catch (error) {
		log('create failed', error);
	}
}

function sendCreate(response, session, workspaceId, pageId, note, deps, config) {
	takeToken(`access-request:${session.userId}`, REQUEST_BUCKET);
	takeToken(`access-request:${session.userId}:${workspaceId}`, WORKSPACE_BUCKET);
	sendJson(response, 202, { ok: true }, config);
	deps.schedule(() => storeRequest(deps, session, workspaceId, pageId, note));
	return true;
}

async function createRequest(deps, session, request, response, pageId, config) {
	const payload = await readJsonBody(request).catch((error) => {
		if (error?.status === 400 || error?.status === 413) throw error;
		throw badRequest('body must be a JSON object.');
	});
	const workspaceId = workspaceIdFrom(payload?.workspaceId);
	const note = noteText(payload?.note);
	if (!UUID_RE.test(pageId)) throw badRequest('pageId must be a UUID.');
	return sendCreate(response, session, workspaceId, pageId, note, deps, config);
}

export function createPageAccessRequestsHandler({
	config, verifySession, fetchImpl = fetch,
	createPageAccessLoader, pageLevelFor,
	ruleStore = createShareRuleStore({ fetchImpl }),
	push = pushToUser, schedule = setImmediate, log = console.error, now = Date.now,
}) {
	const deps = { config, fetchImpl, createPageAccessLoader, pageLevelFor, ruleStore, push, schedule, log, now };
	return async function handleAccessRequests(url, request, response, requestConfig = config) {
		const method = (request.method || 'GET').toUpperCase();
		const decideMatch = DECIDE_PATH.exec(url.pathname);
		const createMatch = CREATE_PATH.exec(url.pathname);
		const isList = method === 'GET' && url.pathname === LIST_PATH;
		if (!isList && !(decideMatch && method === 'POST') && !(createMatch && method === 'POST')) return false;
		try {
			const session = verifySession(bearerToken(request), requestConfig);
			if (isList) return await listRequests(deps, session, url, response, requestConfig);
			if (createMatch) return await createRequest(deps, session, request, response, createMatch[1], requestConfig);
			const requestId = decideMatch[1];
			if (!UUID_RE.test(requestId)) {
				return sendJson(response, 404, { ok: false, error: 'request_not_found', message: 'Access request not found.' }, requestConfig);
			}
			if (decideMatch[2] === 'approve') return await approveRequest(deps, session, request, response, requestId, requestConfig);
			return await declineRequest(deps, session, response, requestId, requestConfig);
		} catch (error) {
			const status = Number(error?.status) || 500;
			if (status >= 500) logger(log)('route failed', error);
			const body = {
				ok: false,
				error: error?.code ?? ({ 401: 'sign_in_required', 429: 'rate_limited' }[status] ?? 'access_request_failed'),
				message: status >= 500 ? 'The access request could not be completed.' : (error?.message ?? 'Request failed.'),
			};
			if (error?.retryAfterSec !== undefined) body.retryAfterSeconds = error.retryAfterSec;
			return sendJson(response, status, body, requestConfig);
		}
	};
}
