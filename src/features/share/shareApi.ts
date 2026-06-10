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

import { api } from '@/shared/api/client';
import type { ShareAccessRule, SharePerson } from './types';

interface PeopleResponse { people: SharePerson[] }
interface RulesResponse { rules: Array<ShareAccessRule & { _id: string }> }
interface RuleResponse { rule: ShareAccessRule & { _id: string } }

/** Workspace roster (people directory served by the bridge). */
export async function fetchPeople(): Promise<SharePerson[]> {
  const body = await api.get<PeopleResponse>('/api/perms/people');
  return body.people ?? [];
}

/** Stored AccessRules for one resource. */
export async function fetchRules(workspaceId: string, resourceId: string): Promise<Array<ShareAccessRule & { _id: string }>> {
  const query = `workspaceId=${encodeURIComponent(workspaceId)}&resourceId=${encodeURIComponent(resourceId)}`;
  const body = await api.get<RulesResponse>(`/api/perms/rules?${query}`);
  return body.rules ?? [];
}

/** Upsert one AccessRule (same workspace/resource/target replaces). */
export async function saveRule(rule: ShareAccessRule): Promise<ShareAccessRule & { _id: string }> {
  const body = await api.post<RuleResponse>('/api/perms/rules', rule);
  return body.rule;
}

/** Delete a stored AccessRule by id. */
export async function deleteRule(ruleId: string): Promise<void> {
  await api.delete<{ deleted: boolean }>(`/api/perms/rules/${encodeURIComponent(ruleId)}`);
}
