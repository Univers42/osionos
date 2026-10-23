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
 */

import { UUID_REGEX, identitySummaries, publishRealtime, sendJson } from './bridge-social-core.mjs';
import { accountError, callerSession, clientMetaOf, readBody, respondWithError } from './bridge-account-sudo.mjs';
import { rateLimit, requireSudo, writeAudit } from './bridge-guard.mjs';

const ROUTE = /^\/api\/workspaces\/([0-9a-f-]{36})(\/leave|\/cancel-delete|\/members\/transfer-ownership)?$/i;
const GRACE_MS = 14 * 86_400_000;
const DELETE_LIMIT = { limit: 5, windowMs: 3_600_000 };

const same = (left, right) => String(left).toLowerCase() === String(right).toLowerCase();
const first = (rows) => (Array.isArray(rows) ? rows[0] ?? null : null);

async function loadWorkspace(service, workspaceId) {
	const row = first(await service.get(`osionos_workspaces?id=eq.${workspaceId}&select=id,owner_id,name,pending_delete_at,delete_after&limit=1`));
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

async function ownedLiveWorkspaces(service, userId) {
	const rows = await service.get(`osionos_workspaces?owner_id=eq.${userId}&pending_delete_at=is.null&select=id`);
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
	if (workspace.pending_delete_at) throw accountError(409, 'already_pending_delete', 'This workspace is already scheduled for deletion.');
	// The owner must keep a workspace of their own: a real account owns several, and the
	// one that is left is the one the app signs them back into.
	if ((await ownedLiveWorkspaces(service, session.userId)) <= 1) throw accountError(409, 'last_workspace', 'Create another workspace before deleting your last one.');
	await audit(ctx, session, request, 'workspace.deleted', { workspaceId, pageCount: await countPages(service, workspaceId) });
	const now = Date.now();
	const deleteAfter = new Date(now + GRACE_MS).toISOString();
	// The filter makes a racing second delete a no-op instead of moving the deadline.
	await service.patch(`osionos_workspaces?id=eq.${workspaceId}&pending_delete_at=is.null`, { pending_delete_at: new Date(now).toISOString(), delete_after: deleteAfter, updated_at: new Date(now).toISOString() }, { prefer: 'return=minimal' });
	return ctx.reply(response, 200, { ok: true, pendingDelete: true, workspaceId, deleteAfter });
}

async function cancelDelete(ctx, session, request, response, workspaceId) {
	const service = ctx.pg.asService();
	const workspace = await requireOwner(service, workspaceId, session.userId, { hideFromStranger: true });
	await requireSudo(ctx.kv, session);
	if (!workspace.pending_delete_at) throw accountError(409, 'not_pending_delete', 'This workspace is not scheduled for deletion.');
	if (Date.parse(workspace.delete_after) <= Date.now()) throw accountError(409, 'grace_expired', 'The grace period is over; the workspace can no longer be restored.');
	await audit(ctx, session, request, 'workspace.delete_cancelled', { workspaceId });
	await service.patch(`osionos_workspaces?id=eq.${workspaceId}`, { pending_delete_at: null, delete_after: null, updated_at: new Date().toISOString() }, { prefer: 'return=minimal' });
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
	const workspace = await loadWorkspace(service, workspaceId);
	const isOwner = () => accountError(409, 'is_owner', 'Transfer ownership before you leave.');
	if (same(workspace.owner_id, session.userId)) throw isOwner();
	const membership = await loadMembership(service, workspaceId, session.userId);
	if (!membership) throw accountError(404, 'not_a_member', 'You are not a member of this workspace.');
	if (membership.role === 'owner') throw isOwner();
	await service.del(`osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${session.userId}`, { prefer: 'return=minimal' });
	// Caveat: the rule key keeps the user id as it was typed, so a rule written with an
	// upper-case id is not matched here and outlives the leave (a non-member it names gains nothing the evaluator grants members).
	// Pending invites do not exist yet (an invite adds the member directly); P3-5-c revokes them here.
	await service.del(`osionos_share_rules?workspace_id=eq.${workspaceId}&target_key=eq.user:${session.userId}:`, { prefer: 'return=minimal' });
	await announceLeft(ctx, session, workspace);
	return ctx.reply(response, 200, { ok: true, left: true });
}

async function transferOwnership(ctx, session, request, response, workspaceId) {
	const service = ctx.pg.asService();
	await requireOwner(service, workspaceId, session.userId, { hideFromStranger: false });
	await requireSudo(ctx.kv, session);
	const { toUserId } = await readBody(request);
	if (typeof toUserId !== 'string' || !UUID_REGEX.test(toUserId)) throw accountError(422, 'invalid_target', 'toUserId must be a user id.');
	if (same(toUserId, session.userId)) throw accountError(409, 'already_owner', 'You already own this workspace.');
	if (!(await loadMembership(service, workspaceId, toUserId))) throw accountError(404, 'member_not_found', 'The new owner must already be a member.');
	await audit(ctx, session, request, 'workspace.ownership_transferred', { workspaceId, toUserId });
	// One function so the owner column and both member rows move together: PostgREST
	// cannot write two rows in one transaction, and a half-done transfer is two owners or none.
	const done = await service.rpc('osionos_workspace_transfer_ownership', { p_workspace: workspaceId, p_from: session.userId, p_to: toUserId });
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
