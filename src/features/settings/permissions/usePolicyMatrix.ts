/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePolicyMatrix.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Load roles + policies via /api/perms/*, derive the matrix, mutate cells.
 *  Mutation = delete the cell's owned policy then create the replacement
 *  (the permission-engine policy surface is append/delete, not patch). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createPolicy, deletePolicy, fetchPeople, fetchPolicies, fetchRoles,
  type EnginePolicyRow, type EngineRole, type SharePerson,
} from '@/features/share';
import { cellState, deriveResources, nextLevel, payloadForCell, type MatrixCellState } from './matrixModel';

export interface PolicyMatrix {
  loading: boolean;
  saving: boolean;
  error: string | null;
  roles: EngineRole[];
  people: SharePerson[];
  policies: EnginePolicyRow[];
  resources: string[];
  cellFor: (roleId: string, resource: string) => MatrixCellState;
  cycleCell: (roleId: string, resource: string) => Promise<void>;
  saveCellConditions: (roleId: string, resource: string, conditions: Record<string, unknown>) => Promise<void>;
  refresh: () => Promise<void>;
}

export function usePolicyMatrix(): PolicyMatrix {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<EngineRole[]>([]);
  const [people, setPeople] = useState<SharePerson[]>([]);
  const [policies, setPolicies] = useState<EnginePolicyRow[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [roleRows, policyRows, roster] = await Promise.all([fetchRoles(), fetchPolicies(), fetchPeople()]);
      setRoles(roleRows);
      setPolicies(policyRows);
      setPeople(roster);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the permission matrix.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const resources = useMemo(() => deriveResources(policies), [policies]);
  const cellFor = useCallback(
    (roleId: string, resource: string) => cellState(policies, roleId, resource),
    [policies],
  );

  const cycleCell = useCallback(async (roleId: string, resource: string) => {
    const cell = cellState(policies, roleId, resource);
    const target = nextLevel(cell.level);
    setSaving(true);
    setError(null);
    try {
      if (cell.policy) await deletePolicy(cell.policy.id);
      if (target !== 'none' && target !== 'deny') {
        await createPolicy(payloadForCell(roleId, resource, target, cell.policy?.conditions ?? null));
      }
      setPolicies(await fetchPolicies());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the policy.');
    } finally {
      setSaving(false);
    }
  }, [policies]);

  const saveCellConditions = useCallback(async (roleId: string, resource: string, conditions: Record<string, unknown>) => {
    const cell = cellState(policies, roleId, resource);
    if (!cell.policy) { setError('No policy on this cell yet — click the cell to grant a level first.'); return; }
    setSaving(true);
    setError(null);
    try {
      await deletePolicy(cell.policy.id);
      await createPolicy({
        role_id: cell.policy.role_id,
        resource_type: cell.policy.resource_type,
        resource_name: cell.policy.resource_name,
        actions: cell.policy.actions,
        effect: cell.policy.effect,
        priority: cell.policy.priority,
        conditions,
      });
      setPolicies(await fetchPolicies());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save conditions.');
    } finally {
      setSaving(false);
    }
  }, [policies]);

  return { loading, saving, error, roles, people, policies, resources, cellFor, cycleCell, saveCellConditions, refresh };
}
