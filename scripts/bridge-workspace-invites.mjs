/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-invites.mjs                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Email invites into an osionos workspace (`/api/workspaces/:id/invites`) plus
 * member role changes / removals (`/api/workspaces/:id/members/:userId`), in the
 * bridge-collab style: bridge-api.mjs injects `config` + `verifySession`, shared
 * plumbing comes from bridge-social-core.mjs, and nothing is re-declared.
 *
 * There is no outbound mail: an invite resolves the account through GoTrue's
 * admin API and, only for an EXACT email match, writes the membership row. An
 * unknown email is a 404 `no_account` (an open-signup server must never mail an
 * arbitrary address) and a lookup failure is a 502, so the route fails closed.
 *
 * The owner and any member with role `admin` may invite/change/remove. The
 * owner's own row is immutable here (409 `is_owner`); a plain member may only
 * remove themself.
 */

import { randomUUID } from 'node:crypto';

import {
  bearerToken,
  httpError,
  identitySummaries,
  publishRealtime,
  readJsonBody,
  requireUuid,
  rest,
  safeText,
  sendJson,
} from './bridge-social-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';

// role → the membership row it grants. `member` is the UI's editable member and
// maps to the DB's `editor`; `guest` maps to the read-only `viewer`.
const ROLE_MAP = new Map([
  ['admin', { role: 'admin', permissions: ['create', 'read', 'update', 'delete', 'admin'] }],
  ['member', { role: 'editor', permissions: ['create', 'read', 'update', 'delete'] }],
  ['guest', { role: 'viewer', permissions: ['read'] }],
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// A human invite is not a hot path: 20 in a burst, one more every 30 seconds.
const INVITE_BUCKET = { capacity: 20, refillPerSec: 1 / 30 };
const ACCOUNT_LOOKUP_TIMEOUT_MS = 5_000;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

async function fetchWorkspace(config, fetchImpl, workspaceId) {
  const rows = await rest(config, fetchImpl, `osionos_workspaces?id=eq.${workspaceId}&select=id,owner_id,name&limit=1`);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

/** The owner, or a member whose row says `admin`; anything else is a 403. */
async function requireWorkspaceAdmin(config, fetchImpl, userId, workspaceId) {
  const workspace = await fetchWorkspace(config, fetchImpl, workspaceId);
  if (!workspace) throw httpError('Workspace not found.', 404);
  if (String(workspace.owner_id).toLowerCase() === String(userId).toLowerCase()) return { workspace, role: 'owner' };
  const rows = await rest(
    config,
    fetchImpl,
    `osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${userId}&select=role,permissions&limit=1`,
  );
  const membership = Array.isArray(rows) ? rows[0] : null;
  if (!membership || String(membership.role ?? '').toLowerCase() !== 'admin') {
    throw httpError('Only the workspace owner or an admin may do this.', 403);
  }
  return { workspace, role: 'admin', membership };
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

function accountName(account) {
  const metadata = account?.user_metadata && typeof account.user_metadata === 'object' ? account.user_metadata : {};
  return safeText(metadata.full_name ?? metadata.name ?? account?.name, 80);
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

/** POST /api/workspaces/:id/invites {email, role} — owner/admin only. */
async function invitePerson(deps, session, request, workspaceId, response, config) {
  const { workspace } = await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
  const payload = await readJsonBody(request);
  const role = inviteRole(payload.role);
  const email = inviteEmail(payload.email);
  takeToken(`workspace-invite:${session.userId}`, INVITE_BUCKET);

  const account = await lookupAccountByEmail(config, deps.fetchImpl, email);
  if (!account) {
    throw Object.assign(
      httpError('No osionos account uses that email yet. Ask them to sign up first, then invite them again.', 404),
      { code: 'no_account' },
    );
  }
  const inviteeId = safeText(account.id, 80);
  if (!inviteeId) throw httpError('The invited account has no usable id.', 502);
  if (String(inviteeId).toLowerCase() === String(workspace.owner_id).toLowerCase()) {
    throw Object.assign(httpError('The workspace owner is already a member.', 409), { code: 'is_owner' });
  }

  const existingRows = await rest(
    config,
    deps.fetchImpl,
    `osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${inviteeId}&select=user_id&limit=1`,
  );
  const existed = Array.isArray(existingRows) && existingRows.length > 0;
  await rest(config, deps.fetchImpl, 'osionos_workspace_members?on_conflict=workspace_id,user_id', {
    method: 'POST',
    body: { workspace_id: workspaceId, user_id: inviteeId, role: role.role, permissions: role.permissions },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });

  const identities = await identitySummaries(config, deps.fetchImpl, [inviteeId, session.userId]);
  const memberName = (identities.get(inviteeId)?.name ?? accountName(account)) || 'Member';
  const inviterName = identities.get(session.userId)?.name ?? 'Member';
  const now = new Date();
  const timestamp = now.toISOString();
  const invite = {
    _id: randomUUID(),
    workspaceId,
    email,
    role: role.name,
    invitedBy: session.userId,
    acceptedAt: timestamp,
    revokedAt: null,
    expiresAt: new Date(now.getTime() + INVITE_TTL_MS).toISOString(),
    token: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await publishMembership(deps, inviteeId, {
    workspaceId,
    workspaceName: workspace.name ?? 'Workspace',
    role: role.role,
    by: { userId: session.userId, name: inviterName },
    op: 'added',
  });
  return sendJson(response, 200, {
    ok: true,
    status: existed ? 'updated' : 'added',
    invite,
    member: { userId: inviteeId, name: memberName, avatar: identities.get(inviteeId)?.avatar ?? null, role: role.role },
  }, config);
}

/** GET /api/workspaces/:id/invites — owner/admin only; no pending invites by design. */
async function listInvites(deps, session, workspaceId, response, config) {
  await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
  return sendJson(response, 200, [], config);
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
  const deps = { fetchImpl, env };
  return async function handleWorkspaceInvitesRoute(url, request, response, requestConfig = config) {
    const pathname = url.pathname;
    const invites = /^\/api\/workspaces\/([0-9a-f-]{36})\/invites$/i.exec(pathname);
    const member = /^\/api\/workspaces\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})$/i.exec(pathname);
    if (!invites && !member) return false;
    const method = (request.method || 'GET').toUpperCase();
    try {
      const session = verifySession(bearerToken(request), requestConfig);
      if (invites && method === 'POST') {
        return await invitePerson(deps, session, request, requireUuid(invites[1], 'workspaceId'), response, requestConfig);
      }
      if (invites && method === 'GET') {
        return await listInvites(deps, session, requireUuid(invites[1], 'workspaceId'), response, requestConfig);
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
