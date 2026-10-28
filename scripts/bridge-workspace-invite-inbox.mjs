/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-invite-inbox.mjs                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The invitee's inbox: what is waiting for them, the token→id resolve for the ?invite=
 * dialog, and declining by id. Every row is keyed on invited_user_id = session.userId;
 * no route here compares an email.
 *
 * /mine is side-effect free and costs five reads whatever the inbox size: the invites
 * (partial index), all workspaces in one in.(…), one identitySummaries call, and one
 * block read plus one edge read for every inviter.
 */

import { identitySummaries, readJsonBody, rest, sendJson } from './bridge-social-core.mjs';
import { inFilter } from './bridge-paging.mjs';
import { takeToken } from './bridge-ratelimit.mjs';
import { TOKEN_SHAPE, declineInvite, findInviteByToken, listLiveInvitesForUser } from './bridge-workspace-invite-store.mjs';
import { connectionStatuses, inviteRequiresConnection } from './bridge-friendship.mjs';
import { ACCEPT_BUCKET, inviteNotFound, isSameId, uiInviteRole } from './bridge-workspace-invite-shared.mjs';

const lower = (value) => String(value ?? '').toLowerCase();

async function workspaceNames(config, fetchImpl, workspaceIds) {
  const ids = [...new Set(workspaceIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const rows = await rest(config, fetchImpl, `osionos_workspaces?${inFilter('id', ids)}&select=id,name`);
  return new Map((Array.isArray(rows) ? rows : []).map((row) => [lower(row.id), row.name]));
}

/** GET /api/invites/mine — the caller's live, unexpired invites, newest first. */
export async function listMyInvites(deps, session, response, config) {
  const rows = await listLiveInvitesForUser(config, deps.fetchImpl, session.userId);
  if (rows.length === 0) return sendJson(response, 200, { invites: [] }, config);
  const inviterIds = [...new Set(rows.map((row) => row.invited_by).filter(Boolean))];
  const statuses = await connectionStatuses(config, deps.fetchImpl, session.userId, inviterIds);
  const gated = inviteRequiresConnection(deps.env);
  // A block in either direction hides the invite; with the flag on, so does a non-friend.
  const visible = rows.filter((row) => {
    const status = statuses.get(lower(row.invited_by)) ?? 'none';
    if (status === 'blocked') return false;
    return !gated || status === 'friends';
  });
  if (visible.length === 0) return sendJson(response, 200, { invites: [] }, config);
  const names = await workspaceNames(config, deps.fetchImpl, visible.map((row) => row.workspace_id));
  const identities = await identitySummaries(config, deps.fetchImpl, visible.map((row) => row.invited_by));
  return sendJson(response, 200, {
    invites: visible.map((row) => ({
      id: row.id,
      workspaceName: names.get(lower(row.workspace_id)) ?? 'Workspace',
      inviterName: identities.get(row.invited_by)?.name ?? 'Member',
      role: uiInviteRole(row.role),
      expiresAt: row.expires_at,
    })),
  }, config);
}

/** POST /api/invites/resolve {token} — {id} only for the account the invite names. */
export async function resolveInvite(deps, session, request, response, config) {
  takeToken(`invite-accept:${session.userId}`, ACCEPT_BUCKET);
  const token = (await readJsonBody(request)).token;
  const invite = typeof token === 'string' && TOKEN_SHAPE.test(token)
    ? await findInviteByToken(config, deps.fetchImpl, token)
    : null;
  const usable = invite
    && isSameId(invite.invited_user_id, session.userId)
    && !invite.revoked_at
    && !invite.accepted_at
    && Date.parse(invite.expires_at) > Date.now();
  if (!usable) throw inviteNotFound();
  return sendJson(response, 200, { id: invite.id }, config);
}

/** POST /api/invites/:id/decline — revoke and stamp declined in one LIVE-filtered PATCH. */
export async function declineMyInvite(deps, session, inviteId, response, config) {
  takeToken(`invite-accept:${session.userId}`, ACCEPT_BUCKET);
  if (!(await declineInvite(config, deps.fetchImpl, inviteId, session.userId))) throw inviteNotFound();
  return sendJson(response, 200, { ok: true }, config);
}
