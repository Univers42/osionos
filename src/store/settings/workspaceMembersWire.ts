/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceMembersWire.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 10:00:00 by dlesieur         #+#    #+#             */
/*   Updated: 2026/10/21 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The bridge answers GET /api/workspaces/:id/members with
 * `{ ok, members: [{ userId, name, avatar, role }] }` and stores the DB roles
 * (owner, admin, editor, viewer); the settings store holds `WorkspaceMember[]`
 * with the UI roles (owner, admin, member, guest). Handing the body over as is
 * put an object where an array belongs and every `.filter` on it threw, which
 * took the whole app down on sign-in (public build, 2026-10-21). Validated here,
 * at the boundary; anything unrecognised is dropped, never thrown.
 */

import type { WorkspaceMember, WorkspaceMemberRole } from './types';

const ROLE_FROM_DB: Record<string, WorkspaceMemberRole> = {
  owner: 'owner',
  admin: 'admin',
  editor: 'member',
  member: 'member',
  viewer: 'guest',
  guest: 'guest',
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** The members a bridge (or legacy array) body carries, or null when it carries none. */
export function workspaceMembersFromWire(workspaceId: string, body: unknown): WorkspaceMember[] | null {
  const rows = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.members) ? body.members : null;
  if (!rows) return null;
  const members: WorkspaceMember[] = [];
  for (const row of rows) {
    if (!isRecord(row) || typeof row.userId !== 'string' || !row.userId) continue;
    const role = ROLE_FROM_DB[typeof row.role === 'string' ? row.role : ''] ?? 'guest';
    members.push({ ...memberShell(workspaceId, row.userId), ...pickDates(row), ...pickName(row.name), role });
  }
  return members;
}

/** The shape `defaultWorkspaceMember` builds; not imported, as `./defaults` drags UI modules in. */
function memberShell(workspaceId: string, userId: string): WorkspaceMember {
  const timestamp = new Date().toISOString();
  return { _id: `wm-${workspaceId}-${userId}`, workspaceId, userId, role: 'guest', joinedAt: timestamp, createdAt: timestamp, updatedAt: timestamp, removedAt: null };
}

// Caveat: the cap is a guess at "longer than any real display name"; a longer one is cut mid-word.
const NAME_LIMIT = 120;

/** The bridge's display name, trimmed and capped; anything else leaves the row unnamed. */
function pickName(value: unknown): { name?: string } {
  const name = typeof value === 'string' ? value.trim().slice(0, NAME_LIMIT) : '';
  return name ? { name } : {};
}

/** Keeps the dates a legacy row carries; the bridge sends none. */
function pickDates(row: Record<string, unknown>): Partial<WorkspaceMember> {
  const dates: Partial<WorkspaceMember> = {};
  for (const key of ['joinedAt', 'createdAt', 'updatedAt'] as const) {
    if (typeof row[key] === 'string') dates[key] = row[key];
  }
  return dates;
}

/** The one member a PATCH answers (`{ok, member}` or a bare row), or null. */
export function workspaceMemberFromWire(workspaceId: string, body: unknown): WorkspaceMember | null {
  const row = isRecord(body) && isRecord(body.member) ? body.member : body;
  return workspaceMembersFromWire(workspaceId, [row])?.[0] ?? null;
}

/** Drops persisted entries that are not member arrays (what the broken build stored). */
export function sanitizePersistedMembers(data: unknown): Record<string, WorkspaceMember[]> {
  if (!isRecord(data)) return {};
  const clean: Record<string, WorkspaceMember[]> = {};
  for (const [workspaceId, members] of Object.entries(data)) {
    if (!Array.isArray(members)) continue;
    clean[workspaceId] = members
      .filter((m): m is WorkspaceMember => isRecord(m) && typeof m.userId === 'string')
      .map((m) => (m.name === undefined || typeof m.name === 'string' ? m : { ...m, name: undefined }));
  }
  return clean;
}
