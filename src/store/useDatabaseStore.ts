/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDatabaseStore.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/08 19:03:52 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/07 00:51:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * useDatabaseStore bridge — mints ids for inline databases created in the
 * editor and keeps a persisted registry of them, so every database the user
 * creates is findable in one place (the sidebar Databases panel) and its name
 * stays in sync when renamed at the origin page.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DEFAULT_OBJECT_DATABASE_ID = 'db-tasks';
export const DEFAULT_OBJECT_DATABASE_VIEW_ID = 'v-tasks-table';

export interface DatabaseReference {
  databaseId: string;
  viewId: string;
}

/** One user-created database, listed in the sidebar Databases panel. */
export interface CreatedDatabaseEntry {
  id: string;
  viewId: string;
  name: string;
  createdAt: number;
}

interface DatabaseStore {
  /** Every database created from the editor, newest first. */
  created: CreatedDatabaseEntry[];
  createInlineDatabase: (name?: string) => DatabaseReference;
  renameCreatedDatabase: (databaseId: string, name: string) => void;
  /** Idempotently list databases that arrived from the server (another browser)
   *  so they appear in the sidebar here too — the registry is otherwise only
   *  populated by createInlineDatabase, which never ran on this device. */
  ensureRegistered: (entries: { id: string; name: string; viewId?: string }[]) => void;
}

export const useDatabaseStore = create<DatabaseStore>()(
  persist(
    (set) => ({
      created: [],
      createInlineDatabase: (name) => {
        const suffix = createIdSuffix();
        const databaseId = `db-${suffix}`;
        const viewId = `${databaseId}-table`;
        const entry: CreatedDatabaseEntry = {
          id: databaseId,
          viewId,
          name: name?.trim() || 'Untitled Database',
          createdAt: Date.now(),
        };
        set((state) => ({ created: [entry, ...state.created] }));
        return { databaseId, viewId };
      },
      renameCreatedDatabase: (databaseId, name) =>
        set((state) => ({
          created: state.created.map((entry) =>
            entry.id === databaseId ? { ...entry, name } : entry,
          ),
        })),
      ensureRegistered: (entries) =>
        set((state) => {
          const known = new Set(state.created.map((entry) => entry.id));
          const additions = entries
            .filter((entry) => !known.has(entry.id))
            .map((entry) => ({
              id: entry.id,
              viewId: entry.viewId ?? `${entry.id}-table`,
              name: entry.name?.trim() || 'Untitled Database',
              createdAt: Date.now(),
            }));
          return additions.length ? { created: [...additions, ...state.created] } : state;
        }),
    }),
    { name: 'osionos.databases.created.v1', partialize: (s) => ({ created: s.created }) },
  ),
);

function createIdSuffix(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
