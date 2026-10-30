/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useImportHistoryStore.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createLocalId, nowIso, upsertById } from './settingsStoreUtils';
import type { ImportHistoryEntry } from './types';

// The history is this device's own record of what Settings > Import did: a page file became a
// page, anything else went into the asset library. No bridge serves /api/imports (only the
// vendored notion-database-sys dev server does), so nothing here talks to a server.
interface ImportHistoryStore {
  data: Record<string, ImportHistoryEntry[]>;
  addEntry: (workspaceId: string, entry: Omit<ImportHistoryEntry, '_id' | 'createdAt' | 'updatedAt'> & Partial<Pick<ImportHistoryEntry, '_id' | 'createdAt' | 'updatedAt'>>) => ImportHistoryEntry;
}

export const useImportHistoryStore = create<ImportHistoryStore>()(
  persist(
    (set) => ({
      data: {},
      addEntry: (workspaceId, entry) => {
        const timestamp = nowIso();
        const record: ImportHistoryEntry = {
          ...entry,
          _id: entry._id ?? createLocalId('import'),
          workspaceId,
          createdAt: entry.createdAt ?? timestamp,
          updatedAt: entry.updatedAt ?? timestamp,
        };
        set((state) => ({ data: { ...state.data, [workspaceId]: upsertById(state.data[workspaceId] ?? [], record) } }));
        return record;
      },
    }),
    {
      name: 'osionos:settings:import-history',
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
