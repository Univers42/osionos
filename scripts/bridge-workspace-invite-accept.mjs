/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-invite-accept.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Accepting an invite, once, for both routes. The token route finds the row by token hash;
 * the by-id route finds it by id + invited_user_id. Everything after that lookup — the
 * refusals, the friendship gate, the inviter's authority, the atomic claim, the membership
 * write and the publish — is acceptInviteRow, so neither route can grow a weaker check.
 *
 * The inviter must still be the workspace owner or an admin (N20): a demoted or removed
 * inviter's pending invite is revoked and answered as used, never honoured.
 */

import {
  fetchWorkspace,
  identitySummaries,
  readJsonBody,
  rest,
  sendJson,
  workspaceMembership,
} from './bridge-social-core.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { bumpAccessAfter } from './bridge-access-generation.mjs';
import { findInviteByToken, findInviteForUser, markAccepted, revokeInvite, TOKEN_SHAPE } from './bridge-workspace-invite-store.mjs';
import { connectionStatus, inviteRequiresConnection } from './bridge-friendship.mjs';
import {
  ACCEPT_BUCKET,
  PERMISSIONS_BY_DB_ROLE,
  coded,
  inviteNotFound,
  isSameId,
  publishMembership,
  requireSession,
} from './bridge-workspace-invite-shared.mjs';

/**
 * The refusal for a token that cannot be accepted, in the order a stranger could learn least:
 * the account check comes first so a third party holding a stolen token learns nothing about
 * its state. The bodies carry no email, workspace, role or id.
 */
function refuseUnacceptable(invite, userId) {
  if (!isSameId(invite.invited_user_id, userId)) throw coded(403, 'invite_wrong_account', 'This invite was sent to a different account.');
  if (invite.revoked_at) {
    // A decline sets both stamps: it is still a refusal, and it reads as "used" like a
    // replayed accept rather than as a revocation the invitee did not ask for.
    if (invite.declined_at) throw coded(410, 'invite_used', 'This invite was already used.');
    throw coded(403, 'invite_revoked', 'This invite was revoked.');
  }
  if (invite.accepted_at) throw coded(410, 'invite_used', 'This invite was already used.');
  if (Date.parse(invite.expires_at) <= Date.now()) throw coded(410, 'invite_expired', 'This invite has expired.');
}

async function inviterStillHoldsAdmin(config, fetchImpl, workspace, inviterId) {
  if (!workspace) return false;
  if (isSameId(workspace.owner_id, inviterId)) return true;
  const membership = await workspaceMembership(config, fetchImpl, inviterId, workspace.id);
  return String(membership?.role ?? '').toLowerCase() === 'admin';
}

/** Every check and write an accepted invite needs, after its row is known. */
export async function acceptInviteRow(deps, session, invite, config) {
  refuseUnacceptable(invite, session.userId);
  if (await workspaceMembership(config, deps.fetchImpl, session.userId, invite.workspace_id)) {
    throw coded(409, 'already_member', 'You are already a member of this workspace.');
  }
  if (inviteRequiresConnection(deps.env)) {
    const status = await connectionStatus(config, deps.fetchImpl, invite.invited_by, session.userId);
    if (status === 'blocked') throw coded(410, 'invite_used', 'This invite was already used.');
    if (status !== 'friends') {
      // void invite atomically like markAccepted does (filtered PATCH)
      await revokeInvite(config, deps.fetchImpl, invite.id);
      throw coded(410, 'invite_used', 'This invite was already used.');
    }
  }
  const workspace = await fetchWorkspace(config, deps.fetchImpl, invite.workspace_id);
  if (!(await inviterStillHoldsAdmin(config, deps.fetchImpl, workspace, invite.invited_by))) {
    await revokeInvite(config, deps.fetchImpl, invite.id);
    throw coded(410, 'invite_used', 'This invite was already used.');
  }
  // Claim the invite before the membership: of two racing accepts only one passes this, so the
  // other cannot publish a second "added".
  if (!(await markAccepted(config, deps.fetchImpl, invite.id, session.userId))) throw coded(410, 'invite_used', 'This invite was already used.');
  await bumpAccessAfter(rest(config, deps.fetchImpl, 'osionos_workspace_members?on_conflict=workspace_id,user_id', {
    method: 'POST',
    body: {
      workspace_id: invite.workspace_id,
      user_id: session.userId,
      role: invite.role,
      permissions: PERMISSIONS_BY_DB_ROLE.get(invite.role) ?? ['read'],
    },
    prefer: 'resolution=ignore-duplicates,return=minimal',
  }), { workspaceId: invite.workspace_id, userId: session.userId });
  const identities = await identitySummaries(config, deps.fetchImpl, [invite.invited_by]);
  await publishMembership(deps, session.userId, {
    workspaceId: invite.workspace_id,
    workspaceName: workspace?.name ?? 'Workspace',
    role: invite.role,
    by: { userId: invite.invited_by, name: identities.get(invite.invited_by)?.name ?? 'Member' },
    op: 'added',
  });
  return { ok: true, workspaceId: invite.workspace_id, role: invite.role };
}

/** POST /api/invites/accept {token} — the signed-in invitee joins with the invite's role. */
export async function acceptInvite(deps, request, response, config) {
  const session = requireSession(deps, request, config, 'Sign in to accept this invite.');
  takeToken(`invite-accept:${session.userId}`, ACCEPT_BUCKET);
  const token = (await readJsonBody(request)).token;
  // A malformed token is the same 404 as an unknown one: nothing to tell them apart by.
  const invite = typeof token === 'string' && TOKEN_SHAPE.test(token) ? await findInviteByToken(config, deps.fetchImpl, token) : null;
  if (!invite) throw inviteNotFound();
  return sendJson(response, 200, await acceptInviteRow(deps, session, invite, config), config);
}

/** POST /api/invites/:id/accept — the same accept, addressed to the caller by id. */
export async function acceptInviteById(deps, session, inviteId, response, config) {
  takeToken(`invite-accept:${session.userId}`, ACCEPT_BUCKET);
  const invite = await findInviteForUser(config, deps.fetchImpl, inviteId, session.userId);
  if (!invite) throw inviteNotFound();
  return sendJson(response, 200, await acceptInviteRow(deps, session, invite, config), config);
}
