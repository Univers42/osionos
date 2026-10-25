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
 *  `visibility` alongside the enforced access rules (including teams); live
 *  database pages persist permission-engine policies (sharePermissionBridge.ts). */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { commitPageSharing, fetchPageSharing, fetchPeople, fetchWorkspacePeople, deleteRule, fetchRules, fetchTeams, saveRule } from './shareApi';
import { createPolicy, deletePolicy, fetchPolicies, fetchRoles } from './sharePolicyApi';
import { toAccessRule, toEnginePolicy } from './sharePermissionBridge';
import { engineRoleName, entriesFromPolicies, entriesFromRules, entryKey, upsertEntry } from './shareModel.helpers';
import { entriesFromPageAccess, sharingWith, sharingWithout, type PageSharing } from './pageShareModel';
import type { EngineRole, ShareEntry, ShareLevel, SharePerson, ShareResource, ShareTeam } from './types';

export interface ShareModel {
  loading: boolean;
  busy: boolean;
  error: string | null;
  isLive: boolean;
  people: SharePerson[];
  teams: ShareTeam[];
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
  const [teams, setTeams] = useState<ShareTeam[]>([]);
  const [ruleEntries, setRuleEntries] = useState<ShareEntry[]>([]);
  const [roles, setRoles] = useState<EngineRole[]>([]);
  const [liveEntries, setEntries] = useState<ShareEntry[]>([]);
  const [sharing, setSharing] = useState<PageSharing | null>(null);
  const generation = useRef(0);
  const resourceKey = JSON.stringify([resource.workspaceId, resource.resourceId, resource.liveResourceName]);
  const [loadedResource, setLoadedResource] = useState<string | null>(null);

  const entries = useMemo(() => (isLive ? liveEntries : sharing ? entriesFromPageAccess(sharing, people, ruleEntries) : []), [isLive, liveEntries, people, ruleEntries, sharing]);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const currentRequest = () => request === generation.current;
    setLoading(true);
    setLoadedResource(null);
    setError(null);
    setPeople([]);
    setTeams([]);
    setRoles([]);
    setRuleEntries([]);
    setEntries([]);
    setSharing(null);
    try {
      if (isLive) {
        const roster = await fetchPeople(resource.workspaceId);
        if (!currentRequest()) return;
        setPeople(roster);
        const [roleRows, policyRows] = await Promise.all([fetchRoles(resource.workspaceId), fetchPolicies(resource.workspaceId)]);
        if (!currentRequest()) return;
        setRoles(roleRows);
        setEntries(entriesFromPolicies(policyRows, roleRows, roster, resource.liveResourceName ?? ''));
      } else {
        const [roster, current, read] = await Promise.all([
          fetchWorkspacePeople(resource.workspaceId), fetchPageSharing(resource.resourceId), fetchRules(resource.workspaceId, resource.resourceId),
        ]);
        const teamList = read.teamRules ? await fetchTeams(resource.workspaceId).catch(() => []) : [];
        if (!currentRequest()) return;
        setTeams(teamList);
        setRuleEntries(entriesFromRules(read.rules, roster, teamList));
        setPeople(roster);
        setSharing(current);
      }
    } catch (cause) {
      if (currentRequest()) setError(errorText(cause, 'Could not load sharing state.'));
    } finally {
      if (currentRequest()) { setLoadedResource(resourceKey); setLoading(false); }
    }
  }, [isLive, resource.liveResourceName, resource.resourceId, resource.workspaceId, resourceKey]);

  useEffect(() => {
    void refresh();
    return () => { generation.current += 1; };
  }, [refresh]);

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
    setSharing(await commitPageSharing(resource.resourceId, sharing, after));
  }, [resource.resourceId, sharing]);

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

  const setLevel = useCallback((target: ShareEntry['target'], level: ShareLevel) => run(async () => {
    if (isLive) {
      await setLivePolicy(target, level);
      return;
    }
    const previous = ruleEntries.find((entry) => entry.key === entryKey(target));
    if (previous || target.type === 'team' || target.type === 'role') {
      const saved = await saveRule(toAccessRule(resource, { key: entryKey(target), target, level, sourceId: previous?.sourceId }));
      setRuleEntries((current) => upsertEntry(current, { key: entryKey(target), target, level, sourceId: saved._id }));
    } else {
      await changePageSharing((current) => sharingWith(current, target, level, people));
    }
  }, 'Could not update access.'), [changePageSharing, isLive, people, resource, ruleEntries, run, setLivePolicy]);

  const removeEntry = useCallback((entry: ShareEntry) => run(async () => {
    if (!isLive) {
      // Remove the underlying page grant as well, so deleting a rule cannot reveal it again.
      if (entry.target.type === 'user' || entry.target.type === 'workspace') {
        await changePageSharing((current) => sharingWithout(current, entry.target));
      } else if (!entry.sourceId || (entry.target.type === 'public' && sharing?.visibility === 'public')) {
        throw new Error('A public page is managed from the Publish section.');
      }
      if (entry.sourceId) await deleteRule(entry.sourceId);
      setRuleEntries((current) => current.filter((existing) => existing.key !== entry.key));
      return;
    }
    if (entry.sourceId) await deletePolicy(entry.sourceId);
    setEntries((current) => current.filter((existing) => existing.key !== entry.key));
  }, 'Could not remove access.'), [changePageSharing, isLive, run, sharing?.visibility]);

  return { loading: loading || loadedResource !== resourceKey, busy, error, isLive, people, teams, roles, entries, setLevel, removeEntry, refresh };
}
