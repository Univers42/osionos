/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-invite-members.mjs                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Member role changes and removals that sit next to the invite routes: owner/admin only,
 * except that a plain member may remove themself. Kept apart from the invite routes so each
 * file stays about one concern.
 */

import {
  fetchWorkspace,
  httpError,
  identitySummaries,
  readJsonBody,
  rest,
  requireWorkspaceAdmin,
  sendJson,
} from './bridge-social-core.mjs';
import { bumpAccessAfter } from './bridge-access-generation.mjs';
import { inviteRole, isSameId, publishMembership } from './bridge-workspace-invite-shared.mjs';

/** PATCH /api/workspaces/:id/members/:userId {role} — owner/admin only. */
export async function changeMemberRole(deps, session, request, workspaceId, targetId, response, config) {
  const { workspace, role: actorRole } = await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
  if (isSameId(targetId, workspace.owner_id)) {
    throw Object.assign(httpError('The workspace owner\'s role cannot be changed.', 409), { code: 'is_owner' });
  }
  const role = inviteRole((await readJsonBody(request)).role);
  const rows = await rest(
    config,
    deps.fetchImpl,
    `osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${targetId}&select=user_id,role&limit=1`,
  );
  if (!Array.isArray(rows) || rows.length === 0) throw httpError('Member not found.', 404);
  // C15 holds here too, or an admin would promote through this route what the invite refuses.
  const touchesAdmin = role.name === 'admin' || String(rows[0].role ?? '').toLowerCase() === 'admin';
  if (touchesAdmin && actorRole !== 'owner') throw httpError('Only the workspace owner may grant or change an admin role.', 403);
  const timestamp = new Date().toISOString();
  await bumpAccessAfter(rest(config, deps.fetchImpl, `osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${targetId}`, {
    method: 'PATCH',
    body: { role: role.role, permissions: role.permissions },
    prefer: 'return=minimal',
  }), { workspaceId, userId: targetId });
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
export async function removeMember(deps, session, workspaceId, targetId, response, config) {
  const workspace = await fetchWorkspace(config, deps.fetchImpl, workspaceId);
  if (!workspace) throw httpError('Workspace not found.', 404);
  if (isSameId(targetId, workspace.owner_id)) {
    throw Object.assign(httpError('The workspace owner cannot be removed.', 409), { code: 'is_owner' });
  }
  const isSelf = isSameId(targetId, session.userId);
  if (!isSelf) await requireWorkspaceAdmin(config, deps.fetchImpl, session.userId, workspaceId);
  const rows = await rest(
    config,
    deps.fetchImpl,
    `osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${targetId}&select=user_id&limit=1`,
  );
  if (!Array.isArray(rows) || rows.length === 0) throw httpError('Member not found.', 404);
  await bumpAccessAfter(rest(config, deps.fetchImpl, `osionos_workspace_members?workspace_id=eq.${workspaceId}&user_id=eq.${targetId}`, {
    method: 'DELETE',
    prefer: 'return=minimal',
  }), { workspaceId, userId: targetId });
  const identities = await identitySummaries(config, deps.fetchImpl, [session.userId]);
  await publishMembership(deps, targetId, {
    workspaceId,
    workspaceName: workspace.name ?? 'Workspace',
    by: { userId: session.userId, name: identities.get(session.userId)?.name ?? 'Member' },
    op: 'removed',
  });
  return sendJson(response, 200, { ok: true, removed: true, userId: targetId }, config);
}
