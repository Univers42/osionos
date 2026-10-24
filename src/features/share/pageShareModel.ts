/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageShareModel.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/15 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** What the Share dialog edits for a page: the `collaborators` and `visibility` the bridge's
 *  read rule enforces (scripts/bridge-page-read.mjs), changed only by the page's owner. A
 *  sharee must be a member of the page's workspace, so the dialog refuses anyone else before
 *  the bridge does (PATCH /api/pages/:id answers 422). Pure: no I/O. */

import type { PageCollaborator, PageCollaboratorRole, PageVisibility } from '@/entities/page';
import type { ShareEntry, ShareLevel, SharePerson } from './types';

export interface PageSharing {
  /** Revision read with the grants, required for an atomic sharing write. */
  version?: number;
  visibility: PageVisibility;
  collaborators: PageCollaborator[];
}

export interface WorkspaceMember {
  userId: string;
  name: string;
  role: string;
}

/** A collaborator is a viewer (reads) or an editor (also writes); nothing in between is enforced. */
export const PAGE_SHARE_LEVELS: readonly ShareLevel[] = ['can_view', 'can_edit'];
/** Visibility 'shared' lets every member read; what each may write is their workspace role. */
export const WORKSPACE_SHARE_LEVELS: readonly ShareLevel[] = ['can_view'];

const PUBLISH_HINT = 'A public page is managed from the Publish section.';
const PAGE_TARGET_HINT = 'A page is shared with people in its workspace, or with the whole workspace.';
const SHARING_KEYS = ['visibility', 'collaborators'];

function sameId(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function levelForRole(role: PageCollaboratorRole): ShareLevel {
  return role === 'viewer' ? 'can_view' : 'can_edit';
}

function roleForLevel(level: ShareLevel): PageCollaboratorRole {
  return level === 'can_edit' || level === 'full_access' ? 'editor' : 'viewer';
}

export function membersToPeople(members: WorkspaceMember[]): SharePerson[] {
  return members.map((member) => ({ id: member.userId, email: '', name: member.name, role: member.role, wsRole: member.role }));
}

function personFor(userId: string, members: SharePerson[]): SharePerson {
  return members.find((member) => sameId(member.id, userId))
    ?? { id: userId, email: 'Not a member of this workspace: cannot open the page', name: 'Former member', role: '' };
}

export function entriesFromPageSharing(sharing: PageSharing, members: SharePerson[]): ShareEntry[] {
  const entries: ShareEntry[] = sharing.collaborators.map((collaborator) => ({
    key: `user:${collaborator.userId}`,
    target: { type: 'user', person: personFor(collaborator.userId, members) },
    level: levelForRole(collaborator.role),
  }));
  if (sharing.visibility === 'shared') entries.push({ key: 'workspace', target: { type: 'workspace' }, level: 'can_view' });
  if (sharing.visibility === 'public') entries.push({ key: 'public', target: { type: 'public' }, level: 'can_view' });
  return entries;
}

/** Explicit rules override the page's legacy grants, just as the bridge evaluates them. */
export function entriesFromPageAccess(sharing: PageSharing, members: SharePerson[], rules: ShareEntry[]): ShareEntry[] {
  const ruled = new Set(rules.map((entry) => entry.key.toLowerCase()));
  return [...entriesFromPageSharing(sharing, members).filter((entry) => !ruled.has(entry.key.toLowerCase())), ...rules];
}

/** The sharing after giving `target` `level`. Throws the message the dialog shows for a target the bridge would refuse. */
export function sharingWith(sharing: PageSharing, target: ShareEntry['target'], level: ShareLevel, members: SharePerson[]): PageSharing {
  if (level === 'no_access') return sharingWithout(sharing, target);
  if (target.type === 'workspace') return { ...sharing, visibility: 'shared' };
  if (target.type === 'public') throw new Error(PUBLISH_HINT);
  if (target.type === 'role' || target.type === 'team') throw new Error(PAGE_TARGET_HINT);
  const { person } = target;
  if (!members.some((member) => sameId(member.id, person.id))) {
    throw new Error(`${person.name} is not a member of this workspace. Add them to the workspace before sharing this page with them.`);
  }
  const granted: PageCollaborator = { userId: person.id, role: roleForLevel(level) };
  const index = sharing.collaborators.findIndex((collaborator) => sameId(collaborator.userId, person.id));
  const collaborators = index < 0
    ? [...sharing.collaborators, granted]
    : sharing.collaborators.map((collaborator, at) => (at === index ? granted : collaborator));
  return { ...sharing, collaborators };
}

export function sharingWithout(sharing: PageSharing, target: ShareEntry['target']): PageSharing {
  if (target.type === 'public') throw new Error(PUBLISH_HINT);
  if (target.type === 'role' || target.type === 'team') throw new Error(PAGE_TARGET_HINT);
  if (target.type === 'workspace') return { ...sharing, visibility: sharing.visibility === 'shared' ? 'private' : sharing.visibility };
  const { person } = target;
  return { ...sharing, collaborators: sharing.collaborators.filter((collaborator) => !sameId(collaborator.userId, person.id)) };
}

/** The PATCH body turning `before` into `after`: only the keys that changed. */
export function sharingPatch(before: PageSharing, after: PageSharing): Partial<PageSharing> {
  const patch: Partial<PageSharing> = {};
  if (before.visibility !== after.visibility) patch.visibility = after.visibility;
  if (JSON.stringify(before.collaborators) !== JSON.stringify(after.collaborators)) patch.collaborators = after.collaborators;
  return patch;
}

/** The bridge answers 200 and lists in `ignored` the sharing keys a non-owner sent; that is a refusal. */
export function assertSharingApplied(body: unknown): void {
  const ignored = (body as { ignored?: unknown } | null)?.ignored;
  if (Array.isArray(ignored) && ignored.some((key) => SHARING_KEYS.includes(String(key)))) {
    throw new Error('Only the page owner can change who has access.');
  }
}
