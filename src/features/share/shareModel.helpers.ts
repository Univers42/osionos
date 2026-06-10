/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shareModel.helpers.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Pure derivations for useShareModel (no IO, no React). */

import { policyToLevel } from './sharePermissionBridge';
import type {
  EnginePolicyRow, EngineRole, ShareAccessRule, ShareEntry, SharePerson,
} from './types';

export function entryKey(target: ShareEntry['target']): string {
  if (target.type === 'user') return `user:${target.person.id}`;
  if (target.type === 'role') return `role:${target.role}`;
  return target.type;
}

/** Stored AccessRules → dialog entries (normal page mode). */
export function entriesFromRules(
  rules: Array<ShareAccessRule & { _id: string }>,
  people: SharePerson[],
): ShareEntry[] {
  const entries: ShareEntry[] = [];
  for (const rule of rules) {
    let target: ShareEntry['target'] | null = null;
    if (rule.target.type === 'user') {
      const person = people.find((candidate) => candidate.id === (rule.target as { userId?: string }).userId);
      if (person) target = { type: 'user', person };
    } else if (rule.target.type === 'role') {
      target = { type: 'role', role: (rule.target as { role?: string }).role ?? '' };
    } else {
      target = { type: rule.target.type };
    }
    if (target) entries.push({ key: entryKey(target), target, level: rule.permission, sourceId: rule._id });
  }
  return entries;
}

/** Engine policies on one table → dialog entries (live database page mode).
 *  People sharing a role collapse onto the role's policy level. */
export function entriesFromPolicies(
  policies: EnginePolicyRow[],
  roles: EngineRole[],
  people: SharePerson[],
  resourceName: string,
): ShareEntry[] {
  const onResource = policies.filter((policy) => policy.resource_name === resourceName);
  const entries: ShareEntry[] = [];
  for (const person of people) {
    const role = roles.find((candidate) => candidate.name === engineRoleName(person));
    if (!role) continue;
    const owned = onResource.filter((policy) => policy.role_id === role.id);
    if (!owned.length) continue;
    const best = owned.find((policy) => policy.effect === 'deny') ?? owned[0];
    entries.push({
      key: `user:${person.id}`,
      target: { type: 'user', person },
      level: policyToLevel(best),
      sourceId: best.id,
    });
  }
  return entries;
}

/** A roster person's engine role name ("analyst" → "agency:analyst"). */
export function engineRoleName(person: SharePerson): string {
  return person.role.includes(':') ? person.role : `agency:${person.role}`;
}

/** Replace-or-append an entry by key. */
export function upsertEntry(entries: ShareEntry[], entry: ShareEntry): ShareEntry[] {
  const index = entries.findIndex((existing) => existing.key === entry.key);
  if (index < 0) return [...entries, entry];
  const next = [...entries];
  next[index] = entry;
  return next;
}
