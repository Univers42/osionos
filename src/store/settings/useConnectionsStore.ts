import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultConnections } from './defaults';
import { createLocalId, errorMessage, nowIso, pushSettingsError, removeById, scheduleSettingsWrite, trySettingsDelete, trySettingsGet, trySettingsPatch, trySettingsPost, upsertById } from './settingsStoreUtils';
import type { ConnectionRecord, ConnectionStatus } from './types';

interface ConnectionsStore {
  data: ConnectionRecord[];
  loading: boolean;
  error: string | null;
  hydrate: (userId: string, email?: string) => Promise<void>;
  byProvider: (providers: string[]) => ConnectionRecord[];
  connect: (input: { userId: string; provider: string; label: string; scopes?: string[]; status?: ConnectionStatus }) => Promise<ConnectionRecord | null>;
  update: (connectionId: string, patch: Partial<ConnectionRecord>) => void;
  disconnect: (connectionId: string) => Promise<void>;
  remove: (connectionId: string) => Promise<void>;
  sync: (connectionId: string) => Promise<void>;
  reset: (userId: string, email?: string) => void;
}

const STORE_NAME = 'osionos:settings:connections';

function localConnection(input: { userId: string; provider: string; label: string; scopes?: string[]; status?: ConnectionStatus }): ConnectionRecord {
  const timestamp = nowIso();
  return {
    _id: createLocalId('connection'),
    userId: input.userId,
    provider: input.provider,
    label: input.label,
    scopes: input.scopes ?? [],
    status: input.status ?? 'connected',
    connectedAt: timestamp,
    lastSyncAt: null,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    removedAt: null,
  };
}

export const useConnectionsStore = create<ConnectionsStore>()(
  persist(
    (set, get) => ({
      data: [],
      loading: false,
      error: null,
      hydrate: async (userId, email) => {
        if (!userId) return;
        set({ loading: true, error: null });
        try {
          const remote = await trySettingsGet<ConnectionRecord[]>('/api/connections');
          set({ data: remote ?? (get().data.length ? get().data : defaultConnections(userId, email)), loading: false, error: null });
        } catch (error) {
          set({ data: get().data.length ? get().data : defaultConnections(userId, email), loading: false, error: errorMessage(error) });
          pushSettingsError('Connections unavailable', error);
        }
      },
      byProvider: (providers) => get().data.filter((connection) => providers.includes(connection.provider) && !connection.removedAt),
      connect: async (input) => {
        const previous = get().data;
        try {
          const remote = await trySettingsPost<ConnectionRecord>('/api/connections', input);
          const connection = remote ?? localConnection(input);
          set({ data: upsertById(previous, connection), error: null });
          return connection;
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not add connection', error);
          return null;
        }
      },
      update: (connectionId, patch) => {
        const previous = get().data;
        const timestamp = nowIso();
        set({ data: previous.map((connection) => connection._id === connectionId ? { ...connection, ...patch, updatedAt: timestamp } : connection), error: null });
        scheduleSettingsWrite(`${STORE_NAME}:${connectionId}`, async () => {
          try {
            const remote = await trySettingsPatch<ConnectionRecord>(`/api/connections/${encodeURIComponent(connectionId)}`, patch);
            if (remote) set({ data: upsertById(get().data, remote), error: null });
          } catch (error) {
            set({ data: previous, error: errorMessage(error) });
            pushSettingsError('Could not save connection', error);
          }
        });
      },
      disconnect: async (connectionId) => {
        await get().remove(connectionId);
      },
      remove: async (connectionId) => {
        const previous = get().data;
        set({ data: removeById(previous, connectionId), error: null });
        try {
          await trySettingsDelete<void>(`/api/connections/${encodeURIComponent(connectionId)}`);
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not remove connection', error);
        }
      },
      sync: async (connectionId) => {
        const previous = get().data;
        const timestamp = nowIso();
        set({ data: previous.map((connection) => connection._id === connectionId ? { ...connection, lastSyncAt: timestamp, updatedAt: timestamp } : connection), error: null });
        try {
          const remote = await trySettingsPost<ConnectionRecord>(`/api/connections/${encodeURIComponent(connectionId)}/sync`, {});
          if (remote) set({ data: upsertById(get().data, remote), error: null });
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not sync connection', error);
        }
      },
      reset: (userId, email) => set({ data: defaultConnections(userId || 'anonymous', email), error: null }),
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
