/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   matrixModel.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Pure matrix derivations: roles × resources → chmod-style cells. */

import type { EnginePolicyPayload, EnginePolicyRow } from '@/features/share';

/** Click-cycle order. `deny` is shown (seeded deny policies) but not cycled to. */
export type MatrixLevel = 'none' | 'view' | 'edit' | 'full' | 'deny';

export const LEVEL_GLYPHS: Record<MatrixLevel, string> = {
  none: '—', view: 'r', edit: 'rw', full: 'rwd', deny: '✕',
};

const LEVEL_ACTIONS: Record<Exclude<MatrixLevel, 'none' | 'deny'>, string[]> = {
  view: ['select'],
  edit: ['select', 'insert', 'update'],
  full: ['select', 'insert', 'update', 'delete'],
};

export interface MatrixCellState {
  level: MatrixLevel;
  policy: EnginePolicyRow | null;
  masked: boolean;
  conditioned: boolean;
}

/** Distinct table resources covered by policies ('*' first, then a-z). */
export function deriveResources(policies: EnginePolicyRow[]): string[] {
  const names = new Set<string>();
  for (const policy of policies) {
    if (policy.resource_type === 'table' || policy.resource_type === '*') names.add(policy.resource_name);
  }
  return [...names].sort((a, b) => (a === '*' ? -1 : b === '*' ? 1 : a.localeCompare(b)));
}

/** Cell for (role, resource): deny wins, else highest-priority allow. */
export function cellState(policies: EnginePolicyRow[], roleId: string, resource: string): MatrixCellState {
  const matched = policies
    .filter((policy) => policy.role_id === roleId && policy.resource_name === resource)
    .sort((a, b) => b.priority - a.priority);
  const deny = matched.find((policy) => policy.effect === 'deny');
  const policy = deny ?? matched[0] ?? null;
  if (!policy) return { level: 'none', policy: null, masked: false, conditioned: false };
  const conditions = policy.conditions ?? {};
  const masked = Boolean(conditions['mask'] ?? conditions['field_mask']);
  const conditioned = Object.keys(conditions).some((key) => key !== 'mask' && key !== 'field_mask');
  if (deny) return { level: 'deny', policy, masked, conditioned };
  const actions = new Set(policy.actions);
  const level: MatrixLevel = actions.has('delete') ? 'full'
    : (actions.has('update') || actions.has('insert')) ? 'edit'
      : actions.has('select') ? 'view' : 'none';
  return { level, policy, masked, conditioned };
}

/** chmod-style click cycle: none→view→edit→full→none (deny resets to none). */
export function nextLevel(level: MatrixLevel): MatrixLevel {
  if (level === 'none') return 'view';
  if (level === 'view') return 'edit';
  if (level === 'edit') return 'full';
  return 'none';
}

/** Build the policy payload for a cell at `level`, carrying conditions over. */
export function payloadForCell(
  roleId: string,
  resource: string,
  level: Exclude<MatrixLevel, 'none' | 'deny'>,
  conditions: Record<string, unknown> | null,
): EnginePolicyPayload {
  return {
    role_id: roleId,
    resource_type: 'table',
    resource_name: resource,
    actions: [...LEVEL_ACTIONS[level]],
    effect: 'allow',
    priority: 50,
    conditions: conditions ?? {},
  };
}
