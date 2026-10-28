/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-invites.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pending email invites into an osionos workspace plus member role changes / removals, in the
 * bridge-collab style: bridge-api.mjs injects `config` + `verifySession`, shared plumbing comes
 * from bridge-social-core.mjs, the invite table from bridge-workspace-invite-store.mjs.
 *
 *   POST   /api/workspaces/:id/invites               create (or replace) a pending invite
 *   GET    /api/workspaces/:id/invites               the workspace's invites, newest first
 *   POST   /api/workspaces/:id/invites/:inviteId/resend   rotate the token and expiry
 *   DELETE /api/workspaces/:id/invites/:inviteId     revoke
 *   POST   /api/invites/accept {token}               the invitee becomes a member
 *   GET    /api/invites/mine                         the invitee's live invites, newest first
 *   POST   /api/invites/resolve {token}              token → {id} for the invitee only
 *   POST   /api/invites/:id/accept                   accept by id, through the same function
 *   POST   /api/invites/:id/decline                  decline by id; nothing joins
 *   PATCH|DELETE /api/workspaces/:id/members/:userId role change / removal
 *
 * There is no outbound mail: the create/resend answer carries the accept link once, for the
 * inviter to pass on. An invite resolves the account through GoTrue's admin API first; an
 * unknown email is a 404 `no_account` (an open-signup server must never mail an arbitrary
 * address) and a lookup failure is a 502, so the route fails closed. The membership is written
 * only by accept, and only for the account the invite was addressed to.
 *
 * The owner and any member with role `admin` may create/list/resend/revoke/change/remove; only
 * the owner may grant `admin`. The owner's own row is immutable here (409 `is_owner`); a plain
 * member may only remove themself.
 */

import {
  bearerToken,
  fetchWorkspace,
  httpError,
  readJsonBody,
  requireUuid,
  requireWorkspaceAdmin,
  rest,
  safeText,
  sendJson,
  workspaceMembership,
} from './bridge-social-core.mjs';
import { findAccountByEmail, readGotrueUser } from './bridge-gotrue-user.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import {
  findLiveInvite,
  listInvites,
  publicInvite,
  revokeInvite,
  rotateInvite,
  saveInvite,
} from './bridge-workspace-invite-store.mjs';
import { connectionStatus, inviteRequiresConnection } from './bridge-friendship.mjs';
import {
  EMAIL_RE,
  INVITE_BUCKET,
  coded,
  inviteEmail,
  inviteRole,
  isSameId,
  requireSession,
} from './bridge-workspace-invite-shared.mjs';
import { acceptInvite, acceptInviteById } from './bridge-workspace-invite-accept.mjs';
import { declineMyInvite, listMyInvites, resolveInvite } from './bridge-workspace-invite-inbox.mjs';
import { changeMemberRole, removeMember } from './bridge-workspace-invite-members.mjs';

/** What the inviter gets once: the row's public fields, the plaintext token and the link. */
export function inviteAnswer(config, { row, token }) {
  return { ok: true, invite: publicInvite(row), token, acceptUrl: `${config.appUrl}/?invite=${encodeURIComponent(token)}` };
}

/**
 * The checks and the write every invite creation shares, whichever route reached it:
 * the target is not the owner and not already a member, then one pending invite row.
 */
async function saveInviteForAccount(deps, session, { workspace, workspaceId, inviteeId, email, role, config, isIdRoute = false }) {
  if (isSameId(inviteeId, workspace.owner_id)) throw coded(409, 'is_owner', 'The workspace owner is already a member.');
  if (await workspaceMembership(config, deps.fetchImpl, inviteeId, workspaceId)) {
    throw coded(409, 'already_member', 'That account is already a member of this workspace.');
  }
  if (inviteRequiresConnection(deps.env)) {
    // C600/C601/C602/C603: friendship required only when flag on
    const status = await connectionStatus(config, deps.fetchImpl, session.userId, inviteeId);
    if (status === 'blocked') {
      // The block is hidden behind the route's "no such account" answer: the
      // inviter must not learn that the account exists and blocked them.
      if (isIdRoute) throw coded(404, 'no_account', 'No osionos account uses that id.');
      throw coded(404, 'no_account', 'No osionos account uses that email yet. Ask them to sign up first, then invite them again.');
    }
    if (status !== 'friends') {
      if (isIdRoute) {
        throw coded(409, 'not_connected', 'You can only invite people you are connected with.', { profileUserId: inviteeId });
      }
      throw coded(409, 'not_connected', 'You can only invite people you are connected with.');
    }
  }
  return saveInvite(config, deps.fetchImpl, { workspaceId, email, inviteeId, role: role.role, invitedBy: session.userId });
}

/** POST /api/workspaces/:id/invites {email, role} — owner/admin only. */
async function invitePerson(deps, session, request, workspaceId, response, config) {
  const { workspace, role: actorRole } = await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
  const payload = await readJsonBody(request);
  const role = inviteRole(payload.role);
  const email = inviteEmail(payload.email);
  if (role.name === 'admin' && actorRole !== 'owner') throw httpError('Only the workspace owner may invite an admin.', 403);
  takeToken(`workspace-invite:${session.userId}`, INVITE_BUCKET);

  // Fail closed: a lookup that cannot be answered is not "no such account".
  const { account } = await findAccountByEmail({ config, fetchImpl: deps.fetchImpl }, email).catch(() => {
    throw httpError('Could not look up that account.', 502);
  });
  if (!account) throw coded(404, 'no_account', 'No osionos account uses that email yet. Ask them to sign up first, then invite them again.');
  const inviteeId = safeText(account.id, 80);
  if (!inviteeId) throw httpError('The invited account has no usable id.', 502);
  const saved = await saveInviteForAccount(deps, session, { workspace, workspaceId, inviteeId, email, role, config, isIdRoute: false });
  return sendJson(response, 200, inviteAnswer(config, saved), config);
}

/**
 * Create the SAME pending invite as POST /api/workspaces/:id/invites, addressed by user id
 * instead of email (C513). No membership row is written: the invitee becomes a member only
 * by accepting. Owner/admin only; non-admins get 403, never the old force-add.
 */
export async function createInviteForUser({ deps, session, workspaceId, userId, role = 'guest', config }) {
  const workspace = await fetchWorkspace(config, deps.fetchImpl, workspaceId);
  if (!workspace) throw httpError('Workspace not found.', 404);
  let actorRole = 'owner';
  if (!isSameId(workspace.owner_id, session.userId)) {
    const membership = await workspaceMembership(config, deps.fetchImpl, session.userId, workspaceId);
    if (String(membership?.role ?? '').toLowerCase() !== 'admin') {
      throw httpError('Only the workspace owner or an admin may invite.', 403);
    }
    actorRole = 'admin';
  }
  const mapped = inviteRole(role);
  if (mapped.name === 'admin' && actorRole !== 'owner') throw httpError('Only the workspace owner may invite an admin.', 403);
  takeToken(`workspace-invite:${session.userId}`, INVITE_BUCKET);
  // The invite row keeps the account's email for display; the userId already proves the
  // account exists, so a directory failure here is an outage (502), never "no account".
  const account = await readGotrueUser({ config, fetchImpl: deps.fetchImpl }, userId).catch(() => {
    throw httpError('Could not look up that account.', 502);
  });
  const email = safeText(account?.email, 320).trim().toLowerCase();
  const inviteeId = safeText(account?.id, 80) || String(userId);
  if (!EMAIL_RE.test(email)) throw coded(404, 'no_account', 'No osionos account uses that id.');
  return saveInviteForAccount(deps, session, { workspace, workspaceId, inviteeId, email, role: mapped, config, isIdRoute: true });
}

/** GET /api/workspaces/:id/invites — owner/admin only. */
async function listWorkspaceInvites(deps, session, workspaceId, response, config) {
  await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
  const rows = await listInvites(config, deps.fetchImpl, workspaceId);
  return sendJson(response, 200, rows.map(publicInvite), config);
}

async function liveInviteOrThrow(deps, session, workspaceId, inviteId, config) {
  await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
  const live = await findLiveInvite(config, deps.fetchImpl, workspaceId, inviteId);
  if (!live) throw coded(404, 'invite_not_found', 'Invite not found.');
  return live;
}

/** POST /api/workspaces/:id/invites/:inviteId/resend — a new token and expiry. */
async function resendInvite(deps, session, workspaceId, inviteId, response, config) {
  const live = await liveInviteOrThrow(deps, session, workspaceId, inviteId, config);
  takeToken(`workspace-invite:${session.userId}`, INVITE_BUCKET);
  if (inviteRequiresConnection(deps.env)) {
    const status = await connectionStatus(config, deps.fetchImpl, session.userId, live.invited_user_id);
    if (status === 'blocked') throw coded(404, 'invite_not_found', 'Invite not found.');
    if (status !== 'friends') {
      throw coded(409, 'not_connected', 'You can only invite people you are connected with.');
    }
  }
  return sendJson(response, 200, inviteAnswer(config, await rotateInvite(config, deps.fetchImpl, live)), config);
}

/** DELETE /api/workspaces/:id/invites/:inviteId — a second revoke is a no-op. */
async function revokePending(deps, session, workspaceId, inviteId, response, config) {
  await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
  const live = await findLiveInvite(config, deps.fetchImpl, workspaceId, inviteId);
  if (live) await revokeInvite(config, deps.fetchImpl, live.id);
  else {
    const known = await rest(config, deps.fetchImpl, `osionos_workspace_invites?id=eq.${inviteId}&workspace_id=eq.${workspaceId}&select=id&limit=1`);
    if (!Array.isArray(known) || known.length === 0) throw coded(404, 'invite_not_found', 'Invite not found.');
  }
  return sendJson(response, 200, { ok: true, revoked: true }, config);
}

const methodNotAllowed = (method, response, config) => sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, config);

/** Build the dispatcher: `await handler(url, request, response)` → true when handled. */
export function createWorkspaceInvitesHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
  const deps = { fetchImpl, env, verifySession };
  const UUID = '([0-9a-f-]{36})';
  const invites = new RegExp(`^/api/workspaces/${UUID}/invites$`, 'i');
  const oneInvite = new RegExp(`^/api/workspaces/${UUID}/invites/${UUID}(/resend)?$`, 'i');
  const memberRoute = new RegExp(`^/api/workspaces/${UUID}/members/${UUID}$`, 'i');
  const inviteAction = new RegExp(`^/api/invites/${UUID}/(accept|decline)$`, 'i');
  return async function handleWorkspaceInvitesRoute(url, request, response, requestConfig = config) {
    const pathname = url.pathname;
    const collection = invites.exec(pathname);
    const one = oneInvite.exec(pathname);
    const member = memberRoute.exec(pathname);
    const action = inviteAction.exec(pathname);
    const accepting = pathname === '/api/invites/accept';
    const mine = pathname === '/api/invites/mine';
    const resolving = pathname === '/api/invites/resolve';
    if (!collection && !one && !member && !action && !accepting && !mine && !resolving) return false;
    const method = (request.method || 'GET').toUpperCase();
    try {
      if (accepting && method === 'POST') return await acceptInvite(deps, request, response, requestConfig);
      if (accepting) return methodNotAllowed(method, response, requestConfig);
      if (mine || resolving || action) {
        const session = requireSession(deps, request, requestConfig);
        if (mine && method === 'GET') return await listMyInvites(deps, session, response, requestConfig);
        if (resolving && method === 'POST') return await resolveInvite(deps, session, request, response, requestConfig);
        if (action && method === 'POST') {
          const inviteId = requireUuid(action[1], 'inviteId');
          if (action[2].toLowerCase() === 'accept') return await acceptInviteById(deps, session, inviteId, response, requestConfig);
          return await declineMyInvite(deps, session, inviteId, response, requestConfig);
        }
        return methodNotAllowed(method, response, requestConfig);
      }
      const session = verifySession(bearerToken(request), requestConfig);
      if (collection && method === 'POST') {
        return await invitePerson(deps, session, request, requireUuid(collection[1], 'workspaceId'), response, requestConfig);
      }
      if (collection && method === 'GET') {
        return await listWorkspaceInvites(deps, session, requireUuid(collection[1], 'workspaceId'), response, requestConfig);
      }
      if (one && one[3] && method === 'POST') {
        return await resendInvite(deps, session, requireUuid(one[1], 'workspaceId'), requireUuid(one[2], 'inviteId'), response, requestConfig);
      }
      if (one && !one[3] && method === 'DELETE') {
        return await revokePending(deps, session, requireUuid(one[1], 'workspaceId'), requireUuid(one[2], 'inviteId'), response, requestConfig);
      }
      if (member && method === 'PATCH') {
        return await changeMemberRole(deps, session, request, requireUuid(member[1], 'workspaceId'), requireUuid(member[2], 'userId'), response, requestConfig);
      }
      if (member && method === 'DELETE') {
        return await removeMember(deps, session, requireUuid(member[1], 'workspaceId'), requireUuid(member[2], 'userId'), response, requestConfig);
      }
      return methodNotAllowed(method, response, requestConfig);
    } catch (error) {
      return sendJson(response, error?.status ?? 500, {
        ok: false,
        ...(error?.code ? { code: error.code } : {}),
        message: error instanceof Error ? error.message : 'Workspace invite request failed.',
      }, requestConfig);
    }
  };
}
