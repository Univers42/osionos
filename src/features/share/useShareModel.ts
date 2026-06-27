/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useShareModel.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Share dialog state + persistence. Normal pages persist AbacEngine
 *  AccessRules; live database pages persist permission-engine policies.
 *  The translation itself lives in sharePermissionBridge.ts. */

import { useCallback, useEffect, useState } from 'react';
import { deleteRule, fetchPeople, fetchRules, saveRule } from './shareApi';
import { createPolicy, deletePolicy, fetchPolicies, fetchRoles } from './sharePolicyApi';
import { toAccessRule, toEnginePolicy } from './sharePermissionBridge';
import {
  engineRoleName, entriesFromPolicies, entriesFromRules, entryKey, upsertEntry,
} from './shareModel.helpers';
import type { EngineRole, ShareEntry, ShareLevel, SharePerson, ShareResource } from './types';

export interface ShareModel {
  loading: boolean;
  busy: boolean;
  error: string | null;
  isLive: boolean;
  people: SharePerson[];
  roles: EngineRole[];
  entries: ShareEntry[];
  setLevel: (target: ShareEntry['target'], level: ShareLevel) => Promise<void>;
  removeEntry: (entry: ShareEntry) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useShareModel(resource: ShareResource): ShareModel {
  const isLive = Boolean(resource.liveResourceName);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<SharePerson[]>([]);
  const [roles, setRoles] = useState<EngineRole[]>([]);
  const [entries, setEntries] = useState<ShareEntry[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const roster = await fetchPeople();
      setPeople(roster);
      if (isLive) {
        const [roleRows, policyRows] = await Promise.all([fetchRoles(), fetchPolicies()]);
        setRoles(roleRows);
        setEntries(entriesFromPolicies(policyRows, roleRows, roster, resource.liveResourceName ?? ''));
      } else {
        setEntries(entriesFromRules(await fetchRules(resource.workspaceId, resource.resourceId), roster));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load sharing state.');
    } finally {
      setLoading(false);
    }
  }, [isLive, resource.liveResourceName, resource.resourceId, resource.workspaceId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const setLevel = useCallback(async (target: ShareEntry['target'], level: ShareLevel) => {
    const entry: ShareEntry = { key: entryKey(target), target, level };
    setBusy(true);
    setError(null);
    try {
      if (isLive) {
        if (target.type !== 'user') throw new Error('Live databases share per person (role-backed).');
        const role = roles.find((candidate) => candidate.name === engineRoleName(target.person));
        if (!role) throw new Error(`No engine role for ${target.person.name}.`);
        const previous = entries.find((existing) => existing.key === entry.key);
        if (previous?.sourceId) await deletePolicy(previous.sourceId);
        const created = await createPolicy(toEnginePolicy(resource, entry, role.id));
        entry.sourceId = created.id;
      } else {
        const saved = await saveRule(toAccessRule(resource, entry));
        entry.sourceId = saved._id;
      }
      setEntries((current) => upsertEntry(current, entry));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update access.');
    } finally {
      setBusy(false);
    }
  }, [entries, isLive, resource, roles]);

  const removeEntry = useCallback(async (entry: ShareEntry) => {
    setBusy(true);
    setError(null);
    try {
      if (entry.sourceId) await (isLive ? deletePolicy(entry.sourceId) : deleteRule(entry.sourceId));
      setEntries((current) => current.filter((existing) => existing.key !== entry.key));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove access.');
    } finally {
      setBusy(false);
    }
  }, [isLive]);

  return { loading, busy, error, isLive, people, roles, entries, setLevel, removeEntry, refresh };
}
