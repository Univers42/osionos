/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useShareModel.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Share dialog state + persistence. A page persists its own `collaborators` and
 *  `visibility`, the fields the bridge's read rule enforces (pageShareModel.ts); live
 *  database pages persist permission-engine policies (sharePermissionBridge.ts). */

import { useCallback, useEffect, useState } from 'react';
import { commitPageSharing, fetchPageSharing, fetchPeople, fetchWorkspacePeople } from './shareApi';
import { createPolicy, deletePolicy, fetchPolicies, fetchRoles } from './sharePolicyApi';
import { toEnginePolicy } from './sharePermissionBridge';
import { engineRoleName, entriesFromPolicies, entryKey, upsertEntry } from './shareModel.helpers';
import { entriesFromPageSharing, sharingWith, sharingWithout, type PageSharing } from './pageShareModel';
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

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function useShareModel(resource: ShareResource): ShareModel {
  const isLive = Boolean(resource.liveResourceName);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<SharePerson[]>([]);
  const [roles, setRoles] = useState<EngineRole[]>([]);
  const [entries, setEntries] = useState<ShareEntry[]>([]);
  const [sharing, setSharing] = useState<PageSharing | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isLive) {
        const roster = await fetchPeople();
        setPeople(roster);
        const [roleRows, policyRows] = await Promise.all([fetchRoles(), fetchPolicies()]);
        setRoles(roleRows);
        setEntries(entriesFromPolicies(policyRows, roleRows, roster, resource.liveResourceName ?? ''));
      } else {
        const [roster, current] = await Promise.all([fetchWorkspacePeople(resource.workspaceId), fetchPageSharing(resource.resourceId)]);
        setPeople(roster);
        setSharing(current);
        setEntries(entriesFromPageSharing(current, roster));
      }
    } catch (cause) {
      setError(errorText(cause, 'Could not load sharing state.'));
    } finally {
      setLoading(false);
    }
  }, [isLive, resource.liveResourceName, resource.resourceId, resource.workspaceId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = useCallback(async (work: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(errorText(cause, fallback));
    } finally {
      setBusy(false);
    }
  }, []);

  /** Pages: the next sharing is computed (and refused, with a message) before anything is sent. */
  const changePageSharing = useCallback(async (next: (current: PageSharing) => PageSharing) => {
    if (!sharing) throw new Error('Sharing is still loading.');
    const after = next(sharing);
    await commitPageSharing(resource.resourceId, sharing, after);
    setSharing(after);
    setEntries(entriesFromPageSharing(after, people));
  }, [people, resource.resourceId, sharing]);

  const setLivePolicy = useCallback(async (target: ShareEntry['target'], level: ShareLevel) => {
    if (target.type !== 'user') throw new Error('Live databases share per person (role-backed).');
    const entry: ShareEntry = { key: entryKey(target), target, level };
    const role = roles.find((candidate) => candidate.name === engineRoleName(target.person));
    if (!role) throw new Error(`No engine role for ${target.person.name}.`);
    const previous = entries.find((existing) => existing.key === entry.key);
    if (previous?.sourceId) await deletePolicy(previous.sourceId);
    const created = await createPolicy(toEnginePolicy(resource, entry, role.id));
    entry.sourceId = created.id;
    setEntries((current) => upsertEntry(current, entry));
  }, [entries, resource, roles]);

  const setLevel = useCallback((target: ShareEntry['target'], level: ShareLevel) => run(
    () => (isLive ? setLivePolicy(target, level) : changePageSharing((current) => sharingWith(current, target, level, people))),
    'Could not update access.',
  ), [changePageSharing, isLive, people, run, setLivePolicy]);

  const removeEntry = useCallback((entry: ShareEntry) => run(async () => {
    if (!isLive) {
      await changePageSharing((current) => sharingWithout(current, entry.target));
      return;
    }
    if (entry.sourceId) await deletePolicy(entry.sourceId);
    setEntries((current) => current.filter((existing) => existing.key !== entry.key));
  }, 'Could not remove access.'), [changePageSharing, isLive, run]);

  return { loading, busy, error, isLive, people, roles, entries, setLevel, removeEntry, refresh };
}
