/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridge-workspace-invite-shared.mjs                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the invite routes share: the role mapping, the coded error shape, the one
 * 404 body for an unusable invite, and the session guard. Routing stays in
 * bridge-workspace-invites.mjs and its sibling route modules.
 */

import { bearerToken, httpError, publishRealtime, safeText } from './bridge-social-core.mjs';

// role → the membership row it grants. `member` is the UI's editable member and
// maps to the DB's `editor`; `guest` maps to the read-only `viewer`.
const ROLE_MAP = new Map([
  ['admin', { role: 'admin', permissions: ['create', 'read', 'update', 'delete', 'admin'] }],
  ['member', { role: 'editor', permissions: ['create', 'read', 'update', 'delete'] }],
  ['guest', { role: 'viewer', permissions: ['read'] }],
]);
const UI_ROLE = new Map([['admin', 'admin'], ['editor', 'member'], ['viewer', 'guest']]);

export const PERMISSIONS_BY_DB_ROLE = new Map([...ROLE_MAP.values()].map((entry) => [entry.role, entry.permissions]));

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// A human invite is not a hot path: 20 in a burst, one more every 30 seconds.
export const INVITE_BUCKET = { capacity: 20, refillPerSec: 1 / 30 };
// Accept, resolve and decline are the invitee's routes: 10 a minute per session bounds guessing.
export const ACCEPT_BUCKET = { capacity: 10, refillPerSec: 10 / 60 };

export const coded = (status, code, message, extra = {}) => Object.assign(httpError(message, status), { code }, extra);
export const isSameId = (left, right) => String(left).toLowerCase() === String(right).toLowerCase();
export const uiInviteRole = (dbRole) => UI_ROLE.get(dbRole) ?? 'guest';

/** The one 404 every unusable invite answers with: an unknown, malformed or wrong-account token alike. */
export const inviteNotFound = () => coded(404, 'invite_not_found', 'This invite link is not valid.');

export function inviteRole(value) {
  const role = safeText(value, 16).toLowerCase();
  const mapping = ROLE_MAP.get(role);
  if (!mapping) throw httpError('role must be admin|member|guest.', 422);
  return { name: role, ...mapping };
}

export function inviteEmail(value) {
  const email = safeText(value, 320).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw httpError('email must be a valid address.', 422);
  return email;
}

/** The invitee's routes all need a session; the token's own route words its own 401. */
export function requireSession(deps, request, config, message = 'Sign in to continue.') {
  try {
    return deps.verifySession(bearerToken(request), config);
  } catch {
    throw coded(401, 'sign_in_required', message);
  }
}

export async function publishMembership(deps, topic, payload) {
  await publishRealtime({
    topic: `user:${topic}`,
    eventType: 'workspace_membership',
    payload,
    fetchImpl: deps.fetchImpl,
    env: deps.env,
  });
}
