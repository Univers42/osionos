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

/** Bridge calls for the Share dialog: roster + page AccessRules (normal pages).
 *  All paths are bridge-relative under /api/perms/* (scripts/bridge-perms.mjs). */

import { api, getActivePageJwt } from '@/shared/api/client';
import { permsPathFor } from './permsPath';
import type { ShareAccessRule, SharePerson, ShareTeam } from './types';

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
