/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shareApi.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Bridge calls for page collaborators, visibility and enforced access rules.
 *  Page sharing uses the workspace members; live policies use the engine roster. */

import { api, getActivePageJwt } from '@/shared/api/client';
import type { PageEntry } from '@/entities/page';
import { usePageStore } from '@/store/usePageStore';
import { assertSharingApplied, membersToPeople, sharingPatch, type PageSharing, type WorkspaceMember } from './pageShareModel';
import { permsPathFor } from './permsPath';
import type { ShareAccessRule, SharePerson, ShareTeam } from './types';

interface MembersResponse { members?: WorkspaceMember[] }
interface PeopleResponse { people: SharePerson[] }
interface RulesResponse { rules: Array<ShareAccessRule & { _id: string }>; teamRules?: boolean }
interface TeamsResponse { teams?: Array<{ id?: unknown; name?: unknown; memberCount?: unknown }> }
interface RuleResponse { rule: ShareAccessRule & { _id: string } }

/** The app-session bearer every /api/perms route requires (the bridge answers 401 without it). */
export function permsBearer(): string | undefined {
  return getActivePageJwt() ?? undefined;
}

/** Workspace roster (people directory served by the bridge). */
export async function fetchPeople(workspaceId: string): Promise<SharePerson[]> {
  const body = await api.get<PeopleResponse>(permsPathFor('/api/perms/people', workspaceId), permsBearer());
  return body.people ?? [];
}

async function fetchRulesRead(workspaceId: string, resourceId: string): Promise<RulesResponse> {
  const query = `workspaceId=${encodeURIComponent(workspaceId)}&resourceId=${encodeURIComponent(resourceId)}`;
  return api.get<RulesResponse>(`/api/perms/rules?${query}`, permsBearer());
}

/**
 * The workspace's teams for the picker: the first page of the route every member may read.
 * Caveat: a workspace with more than 50 teams offers the first 50 (the picker also shows only a
 * few matches); narrowing the search does not reach the rest.
 */
export async function fetchTeams(workspaceId: string): Promise<ShareTeam[]> {
  const body = await api.get<TeamsResponse>(`/api/workspaces/${encodeURIComponent(workspaceId)}/teams?limit=50`, permsBearer());
  return (body.teams ?? []).flatMap((team) => (typeof team.id === 'string' && typeof team.name === 'string'
    ? [{ id: team.id, name: team.name, memberCount: typeof team.memberCount === 'number' ? team.memberCount : 0 }]
    : []));
}

/**
 * Stored AccessRules for one resource only — the Share dialog's own view — and whether the server
 * says it enforces team rules. An absent flag means it does not: the dialog then hides Teams.
 */
export async function fetchRules(workspaceId: string, resourceId: string): Promise<{ rules: Array<ShareAccessRule & { _id: string }>; teamRules: boolean }> {
  const read = await fetchRulesRead(workspaceId, resourceId);
  return { rules: (read.rules ?? []).filter((rule) => rule.resourceId?.toLowerCase() === resourceId.toLowerCase()), teamRules: read.teamRules === true };
}

/** Upsert one AccessRule (same workspace/resource/target replaces). */
export async function saveRule(rule: ShareAccessRule): Promise<ShareAccessRule & { _id: string }> {
  const body = await api.post<RuleResponse>('/api/perms/rules', rule, permsBearer());
  return body.rule;
}

/** Delete a stored AccessRule by id. */
export async function deleteRule(ruleId: string): Promise<void> {
  await api.delete<{ deleted: boolean }>(`/api/perms/rules/${encodeURIComponent(ruleId)}`, permsBearer());
}

export async function fetchWorkspacePeople(workspaceId: string): Promise<SharePerson[]> {
  const body = await api.get<MembersResponse>(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`, permsBearer());
  return membersToPeople(body.members ?? []);
}

export async function fetchPageSharing(pageId: string): Promise<PageSharing> {
  const page = await api.get<Pick<PageEntry, 'visibility' | 'collaborators' | 'contentVersion'>>(`/api/pages/${encodeURIComponent(pageId)}`, permsBearer());
  return { visibility: page.visibility ?? 'private', collaborators: page.collaborators ?? [], version: page.contentVersion };
}

/** Writes what changed, then mirrors it into the page store: the outbox resends the store's
 *  `visibility` with every edit, so a stale copy there would undo the share. */
export async function commitPageSharing(pageId: string, before: PageSharing, after: PageSharing): Promise<PageSharing> {
  const patch = sharingPatch(before, after);
  if (Object.keys(patch).length === 0) return before;
  if (!Number.isSafeInteger(before.version) || (before.version ?? -1) < 0) {
    throw new Error('Sharing requires a page revision. Reload the page and try again.');
  }
  const reply = await api.patch<{ version?: number }>(`/api/pages/${encodeURIComponent(pageId)}`, { ...patch, baseVersion: before.version }, permsBearer());
  assertSharingApplied(reply);
  usePageStore.getState().patchPage(pageId, patch);
  return { ...after, version: reply.version };
}
