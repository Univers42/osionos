/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCollabBrowse.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Browse state for joinable projects: fetch, filter and join via collabApi. */

import { useCallback, useEffect, useState } from 'react';

import {
  joinCollaboration,
  listCollaboration,
  type CollabWorkspace,
  type WorkspaceVisibility,
} from '@/shared/social/collabApi';
import { errorMessage, pushSettingsError } from '@/store/settings/settingsStoreUtils';

export type CollabFilter = 'all' | WorkspaceVisibility;

function matchesFilter(workspace: CollabWorkspace, filter: CollabFilter): boolean {
  return filter === 'all' || workspace.visibility === filter;
}

export interface CollabBrowse {
  workspaces: CollabWorkspace[];
  filtered: CollabWorkspace[];
  filter: CollabFilter;
  query: string;
  loading: boolean;
  error: string | null;
  setFilter: (filter: CollabFilter) => void;
  setQuery: (query: string) => void;
  refresh: () => Promise<void>;
  join: (id: string, message?: string) => Promise<void>;
}

export function useCollabBrowse(): CollabBrowse {
  const [workspaces, setWorkspaces] = useState<CollabWorkspace[]>([]);
  const [filter, setFilter] = useState<CollabFilter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setWorkspaces(await listCollaboration(query || undefined));
    } catch (caught) {
      setError(errorMessage(caught));
      pushSettingsError('Could not load projects', caught);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const join = useCallback(
    async (id: string, message?: string) => {
      try {
        await joinCollaboration(id, message);
        const next: CollabWorkspace['joinState'] = message ? 'requested' : 'member';
        setWorkspaces((current) =>
          current.map((item) => (item.id === id ? { ...item, joinState: next } : item)),
        );
      } catch (caught) {
        setError(errorMessage(caught));
        pushSettingsError('Could not join project', caught);
      }
    },
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    workspaces,
    filtered: workspaces.filter((workspace) => matchesFilter(workspace, filter)),
    filter,
    query,
    loading,
    error,
    setFilter,
    setQuery,
    refresh,
    join,
  };
}
