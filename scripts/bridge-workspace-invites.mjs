/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-invites.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 12:00:00 by dlesieur         ###   ########.fr       */
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
  httpError,
  identitySummaries,
  publishRealtime,
  readJsonBody,
  requireUuid,
  requireWorkspaceAdmin,
  fetchWorkspace,
  rest,
  safeText,
  sendJson,
  workspaceMembership,
} from './bridge-social-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import {
  TOKEN_SHAPE,
  findInviteByToken,
  findLiveInvite,
  listInvites,
  markAccepted,
  publicInvite,
  revokeInvite,
  rotateInvite,
  saveInvite,
} from './bridge-workspace-invite-store.mjs';

// role → the membership row it grants. `member` is the UI's editable member and
// maps to the DB's `editor`; `guest` maps to the read-only `viewer`.
const ROLE_MAP = new Map([
  ['admin', { role: 'admin', permissions: ['create', 'read', 'update', 'delete', 'admin'] }],
  ['member', { role: 'editor', permissions: ['create', 'read', 'update', 'delete'] }],
  ['guest', { role: 'viewer', permissions: ['read'] }],
]);
const PERMISSIONS_BY_DB_ROLE = new Map([...ROLE_MAP.values()].map((entry) => [entry.role, entry.permissions]));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// A human invite is not a hot path: 20 in a burst, one more every 30 seconds.
const INVITE_BUCKET = { capacity: 20, refillPerSec: 1 / 30 };
// Accept is the only route a token holder reaches: 10 a minute per session bounds guessing.
const ACCEPT_BUCKET = { capacity: 10, refillPerSec: 10 / 60 };
const ACCOUNT_LOOKUP_TIMEOUT_MS = 5_000;

const coded = (status, code, message) => Object.assign(httpError(message, status), { code });

function inviteRole(value) {
  const role = safeText(value, 16).toLowerCase();
  const mapping = ROLE_MAP.get(role);
  if (!mapping) throw httpError('role must be admin|member|guest.', 422);
  return { name: role, ...mapping };
}

function inviteEmail(value) {
  const email = safeText(value, 320).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw httpError('email must be a valid address.', 422);
  return email;
}

/**
 * Resolve one account by email through GoTrue's admin list endpoint. The filter
 * is a containment search, so the EXACT case-insensitive match is kept here — a
 * `xdylan@gmail.com` row never answers an invite for `dylan@gmail.com`. Any
 * transport/status/body failure is a 502 (fail closed).
 */
async function lookupAccountByEmail(config, fetchImpl, email) {
  let response;
  try {
    response = await fetchImpl(`${config.baasUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
      headers: { Accept: 'application/json', apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}` },
      signal: AbortSignal.timeout(ACCOUNT_LOOKUP_TIMEOUT_MS),
    });
  } catch {
    throw httpError('Could not look up that account.', 502);
  }
  if (!response?.ok) throw httpError('Could not look up that account.', 502);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw httpError('Could not look up that account.', 502);
  }
  const users = Array.isArray(payload) ? payload : Array.isArray(payload?.users) ? payload.users : [];
  return users.find((user) => String(user?.email ?? '').trim().toLowerCase() === email) ?? null;
}

async function publishMembership(deps, topic, payload) {
  await publishRealtime({
    topic: `user:${topic}`,
    eventType: 'workspace_membership',
    payload,
    fetchImpl: deps.fetchImpl,
    env: deps.env,
  });
}


const isSameId = (left, right) => String(left).toLowerCase() === String(right).toLowerCase();

/** What the inviter gets once: the row's public fields, the plaintext token and the link. */
function inviteAnswer(config, { row, token }) {
  return { ok: true, invite: publicInvite(row), token, acceptUrl: `${config.appUrl}/?invite=${encodeURIComponent(token)}` };
}

/** POST /api/workspaces/:id/invites {email, role} — owner/admin only. */
async function invitePerson(deps, session, request, workspaceId, response, config) {
  const { workspace, role: actorRole } = await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
  const payload = await readJsonBody(request);
  const role = inviteRole(payload.role);
  const email = inviteEmail(payload.email);
  if (role.name === 'admin' && actorRole !== 'owner') throw httpError('Only the workspace owner may invite an admin.', 403);
  takeToken(`workspace-invite:${session.userId}`, INVITE_BUCKET);

  const account = await lookupAccountByEmail(config, deps.fetchImpl, email);
  if (!account) throw coded(404, 'no_account', 'No osionos account uses that email yet. Ask them to sign up first, then invite them again.');
  const inviteeId = safeText(account.id, 80);
  if (!inviteeId) throw httpError('The invited account has no usable id.', 502);
  if (isSameId(inviteeId, workspace.owner_id)) throw coded(409, 'is_owner', 'The workspace owner is already a member.');
  if (await workspaceMembership(config, deps.fetchImpl, inviteeId, workspaceId)) {
    throw coded(409, 'already_member', 'That account is already a member of this workspace.');
  }
  const saved = await saveInvite(config, deps.fetchImpl, { workspaceId, email, inviteeId, role: role.role, invitedBy: session.userId });
  return sendJson(response, 200, inviteAnswer(config, saved), config);
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

/**
 * The refusal for a token that cannot be accepted, in the order a stranger could learn least:
 * the account check comes first so a third party holding a stolen token learns nothing about
 * its state. The bodies carry no email, workspace, role or id.
 */
function refuseUnacceptable(invite, userId) {
  if (!isSameId(invite.invited_user_id, userId)) throw coded(403, 'invite_wrong_account', 'This invite was sent to a different account.');
  if (invite.revoked_at) throw coded(403, 'invite_revoked', 'This invite was revoked.');
  if (invite.accepted_at) throw coded(410, 'invite_used', 'This invite was already used.');
  if (Date.parse(invite.expires_at) <= Date.now()) throw coded(410, 'invite_expired', 'This invite has expired.');
}

/** POST /api/invites/accept {token} — the signed-in invitee joins with the invite's role. */
async function acceptInvite(deps, request, response, config) {
  let session;
  try {
    session = deps.verifySession(bearerToken(request), config);
  } catch {
    throw coded(401, 'sign_in_required', 'Sign in to accept this invite.');
  }
  takeToken(`invite-accept:${session.userId}`, ACCEPT_BUCKET);
  const token = (await readJsonBody(request)).token;
  // A malformed token is the same 404 as an unknown one: nothing to tell them apart by.
  const invite = typeof token === 'string' && TOKEN_SHAPE.test(token) ? await findInviteByToken(config, deps.fetchImpl, token) : null;
  if (!invite) throw coded(404, 'invite_not_found', 'This invite link is not valid.');
  refuseUnacceptable(invite, session.userId);
  if (await workspaceMembership(config, deps.fetchImpl, session.userId, invite.workspace_id)) {
    throw coded(409, 'already_member', 'You are already a member of this workspace.');
  }
  // Claim the invite before the membership: of two racing accepts only one passes this, so the
  // other cannot publish a second "added".
  if (!(await markAccepted(config, deps.fetchImpl, invite.id, session.userId))) throw coded(410, 'invite_used', 'This invite was already used.');
  await rest(config, deps.fetchImpl, 'osionos_workspace_members?on_conflict=workspace_id,user_id', {
    method: 'POST',
    body: {
      workspace_id: invite.workspace_id,
      user_id: session.userId,
      role: invite.role,
      permissions: PERMISSIONS_BY_DB_ROLE.get(invite.role) ?? ['read'],
    },
    prefer: 'resolution=ignore-duplicates,return=minimal',
  });
  const workspace = await fetchWorkspace(config, deps.fetchImpl, invite.workspace_id);
  const identities = await identitySummaries(config, deps.fetchImpl, [invite.invited_by]);
  await publishMembership(deps, session.userId, {
    workspaceId: invite.workspace_id,
    workspaceName: workspace?.name ?? 'Workspace',
    role: invite.role,
    by: { userId: invite.invited_by, name: identities.get(invite.invited_by)?.name ?? 'Member' },
    op: 'added',
  });
  return sendJson(response, 200, { ok: true, workspaceId: invite.workspace_id, role: invite.role }, config);
}

/** PATCH /api/workspaces/:id/members/:userId {role} — owner/admin only. */
async function changeMemberRole(deps, session, request, workspaceId, targetId, response, config) {
  const { workspace } = await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
  if (String(targetId).toLowerCase() === String(workspace.owner_id).toLowerCase()) {
    throw Object.assign(httpError('The workspace owner\'s role cannot be changed.', 409), { code: 'is_owner' });
  }
  const role = inviteRole((await readJsonBody(request)).role);
  const rows = await rest(
    config,
    deps.fetchImpl,
    `osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${targetId}&select=user_id&limit=1`,
  );
  if (!Array.isArray(rows) || rows.length === 0) throw httpError('Member not found.', 404);
  const timestamp = new Date().toISOString();
  await rest(config, deps.fetchImpl, `osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${targetId}`, {
    method: 'PATCH',
    body: { role: role.role, permissions: role.permissions },
    prefer: 'return=minimal',
  });
  const identities = await identitySummaries(config, deps.fetchImpl, [targetId, session.userId]);
  await publishMembership(deps, targetId, {
    workspaceId,
    workspaceName: workspace.name ?? 'Workspace',
    role: role.role,
    by: { userId: session.userId, name: identities.get(session.userId)?.name ?? 'Member' },
    op: 'role',
  });
  return sendJson(response, 200, {
    ok: true,
    member: {
      _id: targetId,
      workspaceId,
      userId: targetId,
      name: identities.get(targetId)?.name ?? 'Member',
      avatar: identities.get(targetId)?.avatar ?? null,
      role: role.role,
      updatedAt: timestamp,
    },
  }, config);
}

/** DELETE /api/workspaces/:id/members/:userId — owner/admin, or the member themself. */
async function removeMember(deps, session, workspaceId, targetId, response, config) {
  const workspace = await fetchWorkspace(config, deps.fetchImpl, workspaceId);
  if (!workspace) throw httpError('Workspace not found.', 404);
  if (String(targetId).toLowerCase() === String(workspace.owner_id).toLowerCase()) {
    throw Object.assign(httpError('The workspace owner cannot be removed.', 409), { code: 'is_owner' });
  }
  const isSelf = String(targetId).toLowerCase() === String(session.userId).toLowerCase();
  if (!isSelf) await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
  const rows = await rest(
    config,
    deps.fetchImpl,
    `osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${targetId}&select=user_id&limit=1`,
  );
  if (!Array.isArray(rows) || rows.length === 0) throw httpError('Member not found.', 404);
  await rest(config, deps.fetchImpl, `osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${targetId}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  });
  const identities = await identitySummaries(config, deps.fetchImpl, [session.userId]);
  await publishMembership(deps, targetId, {
    workspaceId,
    workspaceName: workspace.name ?? 'Workspace',
    by: { userId: session.userId, name: identities.get(session.userId)?.name ?? 'Member' },
    op: 'removed',
  });
  return sendJson(response, 200, { ok: true, removed: true, userId: targetId }, config);
}

/** Build the dispatcher: `await handler(url, request, response)` → true when handled. */
export function createWorkspaceInvitesHandler({ config, verifySession, fetchImpl = fetch, env = process.env }) {
  const deps = { fetchImpl, env, verifySession };
  const UUID = '([0-9a-f-]{36})';
  const invites = new RegExp(`^/api/workspaces/${UUID}/invites$`, 'i');
  const oneInvite = new RegExp(`^/api/workspaces/${UUID}/invites/${UUID}(/resend)?$`, 'i');
  const memberRoute = new RegExp(`^/api/workspaces/${UUID}/members/${UUID}$`, 'i');
  return async function handleWorkspaceInvitesRoute(url, request, response, requestConfig = config) {
    const pathname = url.pathname;
    const collection = invites.exec(pathname);
    const one = oneInvite.exec(pathname);
    const member = memberRoute.exec(pathname);
    const accepting = pathname === '/api/invites/accept';
    if (!collection && !one && !member && !accepting) return false;
    const method = (request.method || 'GET').toUpperCase();
    try {
      if (accepting && method === 'POST') return await acceptInvite(deps, request, response, requestConfig);
      if (accepting) return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
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
      return sendJson(response, 405, { ok: false, message: `Method ${method} is not supported here.` }, requestConfig);
    } catch (error) {
      return sendJson(response, error?.status ?? 500, {
        ok: false,
        ...(error?.code ? { code: error.code } : {}),
        message: error instanceof Error ? error.message : 'Workspace invite request failed.',
      }, requestConfig);
    }
  };
}
