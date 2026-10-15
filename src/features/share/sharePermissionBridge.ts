/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sharePermissionBridge.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE single translation point between the Share dialog's 5-level model and
 * the permission engine, for live DB pages: policy payloads (CreatePolicyDto),
 * persisted via /api/perms/policies. (A normal page shares through its own
 * collaborators and visibility: pageShareModel.ts.) Level→actions contract:
 *      can_view    → ["select"]
 *      can_comment → ["select"]
 *      can_edit    → ["select","insert","update"]
 *      full_access → ["select","insert","update","delete"]
 *      no_access   → effect "deny" on all four actions (deny always wins).
 */

import type {
  EnginePolicyPayload, EnginePolicyRow, ShareEntry, ShareLevel, ShareResource,
} from './types';
import { SHARE_LEVELS } from './types';

const LEVEL_ACTIONS: Record<ShareLevel, string[]> = {
  no_access: ['select', 'insert', 'update', 'delete'],
  can_view: ['select'],
  can_comment: ['select'],
  can_edit: ['select', 'insert', 'update'],
  full_access: ['select', 'insert', 'update', 'delete'],
};

/** Priority bands: share-dialog allows outrank seeded masks; denies cap all. */
const SHARE_ALLOW_PRIORITY = 90;
const SHARE_DENY_PRIORITY = 110;

export function levelToActions(level: ShareLevel): string[] {
  return [...LEVEL_ACTIONS[level]];
}

/** Share entry → permission-engine policy payload (live database page path). */
export function toEnginePolicy(resource: ShareResource, entry: ShareEntry, roleId: string): EnginePolicyPayload {
  const deny = entry.level === 'no_access';
  return {
    role_id: roleId,
    resource_type: 'table',
    resource_name: resource.liveResourceName ?? resource.resourceId,
    actions: levelToActions(entry.level),
    effect: deny ? 'deny' : 'allow',
    priority: deny ? SHARE_DENY_PRIORITY : SHARE_ALLOW_PRIORITY,
    conditions: { share_dialog: true },
  };
}

/** Inverse mapping: an engine policy row → the closest ShareLevel. */
export function policyToLevel(policy: Pick<EnginePolicyRow, 'actions' | 'effect'>): ShareLevel {
  if (policy.effect === 'deny') return 'no_access';
  const actions = new Set(policy.actions);
  if (actions.has('delete')) return 'full_access';
  if (actions.has('update') || actions.has('insert')) return 'can_edit';
  if (actions.has('select')) return 'can_view';
  return 'no_access';
}

/** True when `level` grants at least `required` (AbacEngine hierarchy order). */
export function levelAtLeast(level: ShareLevel, required: ShareLevel): boolean {
  return SHARE_LEVELS.indexOf(level) >= SHARE_LEVELS.indexOf(required);
}
