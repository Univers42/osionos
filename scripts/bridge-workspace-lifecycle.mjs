/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-lifecycle.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Workspace lifecycle: staged delete (14-day grace), cancel, leave, and ownership transfer.
 *
 *   DELETE /api/workspaces/:id                              owner + sudo, marks pending_delete
 *   POST   /api/workspaces/:id/cancel-delete                owner + sudo, inside the window
 *   POST   /api/workspaces/:id/leave                        any member but the owner
 *   POST   /api/workspaces/:id/members/transfer-ownership   owner + sudo, one SQL function
 *
 * Delete never removes a row: pages, members and share rules stay until a later sweep, so a
 * cancel inside the window loses nothing. The role check comes before the sudo check so a
 * caller who may not act learns that, not that a step-up would help.
 *
 * Delete is one SQL function (osionos_workspace_mark_delete): it locks the owner's workspaces,
 * refuses the last live one and binds the mark to the owner it checked, so two racing deletes
 * cannot both leave the other as the survivor. A workspace still marked after its delete_after
 * (no sweep has run) may be deleted again, which re-stamps a fresh window; inside the window a
 * second delete is 409 already_pending_delete. Cancel is refused once the window has passed.
 * Transfer is refused (409 pending_delete) on a workspace scheduled for deletion.
 *
 * Leave and realtime: the leaver's open sockets are not cut. A realtime token lives up to 900 s
 * and the session dies within one cutoff poll (scripts/bridge-realtime-token.mjs), so a left
 * workspace can still deliver events for that long. Nothing here claims immediate revocation.
 */

import { UUID_REGEX, identitySummaries, publishRealtime, sendJson } from './bridge-social-core.mjs';
import { accountError, callerSession, clientMetaOf, readBody, respondWithError } from './bridge-account-sudo.mjs';
import { rateLimit, requireSudo, writeAudit } from './bridge-guard.mjs';
import { bumpAccessAfter } from './bridge-access-generation.mjs';

const ROUTE = /^\/api\/workspaces\/([0-9a-f-]{36})(\/leave|\/cancel-delete|\/members\/transfer-ownership)?$/i;
const GRACE_MS = 14 * 86_400_000;
const DELETE_LIMIT = { limit: 5, windowMs: 3_600_000 };

const MARK_REFUSALS = {
	last_workspace: [409, 'last_workspace', 'Create another workspace before deleting your last one.'],
	already_pending: [409, 'already_pending_delete', 'This workspace is already scheduled for deletion.'],
	not_owner: [409, 'owner_changed', 'The workspace owner changed; reload and try again.'],
};

const same = (left, right) => String(left).toLowerCase() === String(right).toLowerCase();
const first = (rows) => (Array.isArray(rows) ? rows[0] ?? null : null);

async function findWorkspace(service, workspaceId) {
	return first(await service.get(`osionos_workspaces?id=eq.${workspaceId}&select=id,owner_id,name,pending_delete_at,delete_after&limit=1`));
}

async function loadWorkspace(service, workspaceId) {
	const row = await findWorkspace(service, workspaceId);
	if (!row) throw accountError(404, 'workspace_not_found', 'Workspace not found.');
	return row;
}

async function loadMembership(service, workspaceId, userId) {
	return first(await service.get(`osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${userId}&select=user_id,role&limit=1`));
}

/** Owner or nothing: a member is told 403, anyone else 404, so a stranger learns no more than the id they sent. */
async function requireOwner(service, workspaceId, userId, { hideFromStranger }) {
	const workspace = await loadWorkspace(service, workspaceId);
	if (same(workspace.owner_id, userId)) return workspace;
	if (hideFromStranger && !(await loadMembership(service, workspaceId, userId))) throw accountError(404, 'workspace_not_found', 'Workspace not found.');
	throw accountError(403, 'forbidden', 'Only the workspace owner may do this.');
}

// Caveat: the page count is read through PostgREST, so a workspace above its max-rows cap
// is audited at the cap, not its true size. The audit row is a record of the attempt.
async function countPages(service, workspaceId) {
	const rows = await service.get(`osionos_pages?workspace_id=eq.${workspaceId}&select=id`);
	return Array.isArray(rows) ? rows.length : 0;
}

function audit(ctx, session, request, eventType, details) {
	return writeAudit(ctx.pg, { session, meta: clientMetaOf(request, ctx.config), eventType, details });
}

async function deleteWorkspace(ctx, session, request, response, workspaceId) {
	const service = ctx.pg.asService();
	const workspace = await requireOwner(service, workspaceId, session.userId, { hideFromStranger: true });
	await requireSudo(ctx.kv, session);
	await rateLimit(ctx.kv, ['workspace-delete', session.userId], DELETE_LIMIT);
	if (workspace.pending_delete_at && Date.parse(workspace.delete_after) > Date.now()) throw accountError(409, 'already_pending_delete', 'This workspace is already scheduled for deletion.');
	await audit(ctx, session, request, 'workspace.deleted', { workspaceId, pageCount: await countPages(service, workspaceId) });
	const now = Date.now();
	const deleteAfter = new Date(now + GRACE_MS).toISOString();
	// The owner must keep a workspace of their own: a real account owns several, and the one
	// that is left is the one the app signs them back into. The function decides it under lock.
	const outcome = await bumpAccessAfter(service.rpc('osionos_workspace_mark_delete', { p_workspace: workspaceId, p_owner: session.userId, p_now: new Date(now).toISOString(), p_after: deleteAfter }), { workspaceId });
	const refusal = MARK_REFUSALS[outcome];
	if (outcome !== 'marked') throw refusal ? accountError(...refusal) : accountError(409, 'delete_conflict', 'The workspace changed while deleting; reload and try again.');
	return ctx.reply(response, 200, { ok: true, pendingDelete: true, workspaceId, deleteAfter });
}

async function cancelDelete(ctx, session, request, response, workspaceId) {
	const service = ctx.pg.asService();
	const workspace = await requireOwner(service, workspaceId, session.userId, { hideFromStranger: true });
	await requireSudo(ctx.kv, session);
	if (!workspace.pending_delete_at) throw accountError(409, 'not_pending_delete', 'This workspace is not scheduled for deletion.');
	if (Date.parse(workspace.delete_after) <= Date.now()) throw accountError(409, 'grace_expired', 'The grace period is over; the workspace can no longer be restored.');
	await audit(ctx, session, request, 'workspace.delete_cancelled', { workspaceId });
	// The filter makes a cancel racing another cancel (or a sweep) match nothing, and nothing is a 409.
	const cleared = await bumpAccessAfter(service.patch(`osionos_workspaces?id=eq.${workspaceId}&pending_delete_at=not.is.null&select=id`, { pending_delete_at: null, delete_after: null, updated_at: new Date().toISOString() }, { prefer: 'return=representation' }), { workspaceId });
	if (!Array.isArray(cleared) || cleared.length === 0) throw accountError(409, 'not_pending_delete', 'This workspace is not scheduled for deletion.');
	return ctx.reply(response, 200, { ok: true, cancelled: true });
}

// Best effort, like the member routes: the leave already happened, a missed event only
// delays the leaver's other tabs until their next poll.
async function announceLeft(ctx, session, workspace) {
	try {
		const identities = await identitySummaries(ctx.config, ctx.fetchImpl, [session.userId]);
		await publishRealtime({
			topic: `user:${session.userId}`,
			eventType: 'workspace_membership',
			payload: { workspaceId: workspace.id, workspaceName: workspace.name ?? 'Workspace', by: { userId: session.userId, name: identities.get(session.userId)?.name ?? 'Member' }, op: 'removed' },
			fetchImpl: ctx.fetchImpl,
			env: ctx.env,
		});
	} catch (error) {
		console.warn(`[osionos-bridge] leave announce skipped: ${error instanceof Error ? error.message : 'failed'}`);
	}
}

async function leaveWorkspace(ctx, session, response, workspaceId) {
	const service = ctx.pg.asService();
	// An unknown id answers like a workspace the caller is not in, so the route is no existence oracle.
	const workspace = await findWorkspace(service, workspaceId);
	if (!workspace) throw accountError(404, 'not_a_member', 'You are not a member of this workspace.');
	const isOwner = () => accountError(409, 'is_owner', 'Transfer ownership before you leave.');
	if (same(workspace.owner_id, session.userId)) throw isOwner();
	const membership = await loadMembership(service, workspaceId, session.userId);
	if (!membership) throw accountError(404, 'not_a_member', 'You are not a member of this workspace.');
	if (membership.role === 'owner') throw isOwner();
	// role=neq.owner: a transfer that made this caller the owner after the read above matches no row.
	const removed = await bumpAccessAfter(service.del(`osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${session.userId}&role=neq.owner&select=user_id`, { prefer: 'return=representation' }), { workspaceId, userId: session.userId });
	if (!Array.isArray(removed) || removed.length === 0) throw isOwner();
	// ilike: the rule key keeps the user id as it was typed, so the match ignores case.
	// Pending invites do not exist yet (an invite adds the member directly); P3-5-c revokes them here.
	await bumpAccessAfter(service.del(`osionos_share_rules?workspace_id=eq.${workspaceId}&target_key=ilike.user:${session.userId}:`, { prefer: 'return=minimal' }), { workspaceId, userId: session.userId });
	await announceLeft(ctx, session, workspace);
	return ctx.reply(response, 200, { ok: true, left: true });
}

async function transferOwnership(ctx, session, request, response, workspaceId) {
	const service = ctx.pg.asService();
	const workspace = await requireOwner(service, workspaceId, session.userId, { hideFromStranger: true });
	await requireSudo(ctx.kv, session);
	if (workspace.pending_delete_at) throw accountError(409, 'pending_delete', 'Cancel the scheduled deletion before transferring ownership.');
	const { toUserId } = await readBody(request);
	if (typeof toUserId !== 'string' || !UUID_REGEX.test(toUserId)) throw accountError(422, 'invalid_target', 'toUserId must be a user id.');
	if (same(toUserId, session.userId)) throw accountError(409, 'already_owner', 'You already own this workspace.');
	if (!(await loadMembership(service, workspaceId, toUserId))) throw accountError(404, 'member_not_found', 'The new owner must already be a member.');
	await audit(ctx, session, request, 'workspace.ownership_transferred', { workspaceId, toUserId });
	// One function so the owner column and both member rows move together: PostgREST
	// cannot write two rows in one transaction, and a half-done transfer is two owners or none.
	const done = await bumpAccessAfter(service.rpc('osionos_workspace_transfer_ownership', { p_workspace: workspaceId, p_from: session.userId, p_to: toUserId }), { workspaceId, userId: [session.userId, toUserId] });
	if (done !== true) throw accountError(409, 'transfer_conflict', 'The workspace changed while transferring; reload and try again.');
	const rows = await service.get(`osionos_workspace_members?workspace_id=eq.${workspaceId}&select=user_id,role`);
	const members = (Array.isArray(rows) ? rows : []).map((row) => ({ userId: row.user_id, role: row.role }));
	return ctx.reply(response, 200, { ok: true, ownerId: toUserId, members });
}

const ROUTES = {
	'DELETE ': (ctx, session, request, response, id) => deleteWorkspace(ctx, session, request, response, id),
	'POST /cancel-delete': (ctx, session, request, response, id) => cancelDelete(ctx, session, request, response, id),
	'POST /leave': (ctx, session, _request, response, id) => leaveWorkspace(ctx, session, response, id),
	'POST /members/transfer-ownership': (ctx, session, request, response, id) => transferOwnership(ctx, session, request, response, id),
};

export function createWorkspaceLifecycleRoutes({ config, pg, kv, verifySession, mfaEnv, mfaFetch }) {
	const ctx = { config, pg, kv, fetchImpl: mfaFetch ?? fetch, env: mfaEnv ?? process.env, reply: (res, status, body) => sendJson(res, status, body, config) };
	return async function handleWorkspaceLifecycle(url, request, response) {
		const match = ROUTE.exec(url.pathname);
		if (!match) return false;
		const handler = ROUTES[`${(request.method || 'GET').toUpperCase()} ${(match[2] ?? '').toLowerCase()}`];
		if (!handler) return false;
		try {
			const session = callerSession(request, config, verifySession);
			await handler(ctx, session, request, response, match[1].toLowerCase());
			return true;
		} catch (error) {
			respondWithError(response, error, config);
			return true;
		}
	};
}
