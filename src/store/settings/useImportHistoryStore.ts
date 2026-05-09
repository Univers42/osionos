import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { createLocalId, errorMessage, nowIso, pushSettingsError, trySettingsGet, trySettingsUpload, upsertById } from './settingsStoreUtils';
import type { ImportHistoryEntry } from './types';

interface ImportHistoryStore {
  data: Record<string, ImportHistoryEntry[]>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  hydrate: (workspaceId: string) => Promise<void>;
  upload: (workspaceId: string, file: File, source?: string) => Promise<ImportHistoryEntry | null>;
  addEntry: (workspaceId: string, entry: Omit<ImportHistoryEntry, '_id' | 'createdAt' | 'updatedAt'> & Partial<Pick<ImportHistoryEntry, '_id' | 'createdAt' | 'updatedAt'>>) => ImportHistoryEntry;
  markRetry: (workspaceId: string, importId: string) => void;
  reset: (workspaceId: string) => void;
}

const STORE_NAME = 'osionos:settings:import-history';

function localImport(workspaceId: string, file: File, source: string): ImportHistoryEntry {
  const timestamp = nowIso();
  return {
    _id: createLocalId('import'),
    userId: 'local',
    workspaceId,
    source,
    fileName: file.name,
    byteSize: file.size,
    status: 'completed',
    pageIds: [],
    error: null,
    startedAt: timestamp,
    finishedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    removedAt: null,
  };
}

export const useImportHistoryStore = create<ImportHistoryStore>()(
  persist(
    (set, get) => ({
      data: {},
      loading: {},
      error: {},
      hydrate: async (workspaceId) => {
        if (!workspaceId) return;
        set((state) => ({ loading: { ...state.loading, [workspaceId]: true }, error: { ...state.error, [workspaceId]: null } }));
        try {
          const remote = await trySettingsGet<ImportHistoryEntry[]>('/api/imports');
          const entries = remote?.filter((entry) => entry.workspaceId === workspaceId) ?? get().data[workspaceId] ?? [];
          set((state) => ({ data: { ...state.data, [workspaceId]: entries }, loading: { ...state.loading, [workspaceId]: false }, error: { ...state.error, [workspaceId]: null } }));
        } catch (error) {
          set((state) => ({ loading: { ...state.loading, [workspaceId]: false }, error: { ...state.error, [workspaceId]: errorMessage(error) } }));
          pushSettingsError('Import history unavailable', error);
        }
      },
      upload: async (workspaceId, file, source = 'upload') => {
        const previous = get().data[workspaceId] ?? [];
        const formData = new FormData();
        formData.append('workspaceId', workspaceId);
        formData.append('source', source);
        formData.append('file', file);
        try {
          const remote = await trySettingsUpload<ImportHistoryEntry>('/api/imports', formData);
          const entry = remote ?? localImport(workspaceId, file, source);
          set((state) => ({ data: { ...state.data, [workspaceId]: upsertById(previous, entry) }, error: { ...state.error, [workspaceId]: null } }));
          return entry;
        } catch (error) {
          set((state) => ({ data: { ...state.data, [workspaceId]: previous }, error: { ...state.error, [workspaceId]: errorMessage(error) } }));
          pushSettingsError('Could not import file', error);
          return null;
        }
      },
      addEntry: (workspaceId, entry) => {
        const timestamp = nowIso();
        const record: ImportHistoryEntry = {
          ...entry,
          _id: entry._id ?? createLocalId('import'),
          workspaceId,
          createdAt: entry.createdAt ?? timestamp,
          updatedAt: entry.updatedAt ?? timestamp,
        };
        set((state) => ({ data: { ...state.data, [workspaceId]: upsertById(state.data[workspaceId] ?? [], record) }, error: { ...state.error, [workspaceId]: null } }));
        return record;
      },
      markRetry: (workspaceId, importId) => {
        const timestamp = nowIso();
        set((state) => ({
          data: {
            ...state.data,
            [workspaceId]: (state.data[workspaceId] ?? []).map((entry) => entry._id === importId
              ? { ...entry, status: 'queued', error: null, updatedAt: timestamp }
              : entry),
          },
        }));
      },
      reset: (workspaceId) => set((state) => ({ data: { ...state.data, [workspaceId]: [] }, error: { ...state.error, [workspaceId]: null } })),
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
