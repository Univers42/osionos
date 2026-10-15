/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shareApi.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Bridge calls for the Share dialog. A page's sharing is its own row: read with
 *  GET /api/pages/:id, changed with the owner-only PATCH /api/pages/:id, and the people it
 *  can be shared with are its workspace's members (GET /api/workspaces/:id/members). The
 *  agency roster (/api/perms/people) serves the live-database mode only. */

import { api, getActivePageJwt } from '@/shared/api/client';
import type { PageEntry } from '@/entities/page';
import { usePageStore } from '@/store/usePageStore';
import { assertSharingApplied, membersToPeople, sharingPatch, type PageSharing, type WorkspaceMember } from './pageShareModel';
import type { SharePerson } from './types';

interface PeopleResponse { people: SharePerson[] }
interface MembersResponse { members?: WorkspaceMember[] }

export function permsBearer(): string | undefined {
  return getActivePageJwt() ?? undefined;
}

export async function fetchPeople(): Promise<SharePerson[]> {
  const body = await api.get<PeopleResponse>('/api/perms/people', permsBearer());
  return body.people ?? [];
}

export async function fetchWorkspacePeople(workspaceId: string): Promise<SharePerson[]> {
  const body = await api.get<MembersResponse>(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`, permsBearer());
  return membersToPeople(body.members ?? []);
}

export async function fetchPageSharing(pageId: string): Promise<PageSharing> {
  const page = await api.get<Pick<PageEntry, 'visibility' | 'collaborators'>>(`/api/pages/${encodeURIComponent(pageId)}`, permsBearer());
  return { visibility: page.visibility ?? 'private', collaborators: page.collaborators ?? [] };
}

/** Writes what changed, then mirrors it into the page store: the outbox resends the store's
 *  `visibility` with every edit, so a stale copy there would undo the share. */
export async function commitPageSharing(pageId: string, before: PageSharing, after: PageSharing): Promise<void> {
  const patch = sharingPatch(before, after);
  if (Object.keys(patch).length === 0) return;
  assertSharingApplied(await api.patch<unknown>(`/api/pages/${encodeURIComponent(pageId)}`, patch, permsBearer()));
  usePageStore.getState().patchPage(pageId, patch);
}
