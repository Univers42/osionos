import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultDevice } from './defaults';
import { errorMessage, nowIso, pushSettingsError, trySettingsDelete, trySettingsGet } from './settingsStoreUtils';
import type { DeviceRecord } from './types';

interface AccountDevicesStore {
  data: DeviceRecord[];
  loading: boolean;
  error: string | null;
  hydrate: (userId: string) => Promise<void>;
  revoke: (deviceId: string) => Promise<void>;
  revokeAll: (userId: string) => Promise<void>;
  revokeAllExceptCurrent: (userId: string) => Promise<void>;
  reset: (userId: string) => void;
}

const STORE_NAME = 'osionos:settings:account-devices';

export const useAccountDevicesStore = create<AccountDevicesStore>()(
  persist(
    (set, get) => ({
      data: [],
      loading: false,
      error: null,
      hydrate: async (userId) => {
        if (!userId) return;
        set({ loading: true, error: null });
        try {
          const remote = await trySettingsGet<DeviceRecord[]>('/api/account/devices');
          set({ data: remote ?? (get().data.length ? get().data : [defaultDevice(userId)]), loading: false, error: null });
        } catch (error) {
          set({ data: get().data.length ? get().data : [defaultDevice(userId)], loading: false, error: errorMessage(error) });
          pushSettingsError('Devices unavailable', error);
        }
      },
      revoke: async (deviceId) => {
        const previous = get().data;
        const timestamp = nowIso();
        set({ data: previous.map((device) => device._id === deviceId ? { ...device, revokedAt: timestamp, updatedAt: timestamp } : device), error: null });
        try {
          await trySettingsDelete<void>(`/api/account/devices/${encodeURIComponent(deviceId)}`);
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not revoke device', error);
        }
      },
      revokeAll: async (userId) => {
        const previous = get().data;
        const timestamp = nowIso();
        set({ data: previous.map((device) => ({ ...device, revokedAt: timestamp, updatedAt: timestamp })), error: null });
        try {
          await trySettingsDelete<void>('/api/account/devices');
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not revoke devices', error);
        }
        if (!previous.length) set({ data: [defaultDevice(userId)] });
      },
      revokeAllExceptCurrent: async (userId) => {
        const previous = get().data.length ? get().data : [defaultDevice(userId)];
        const current = previous.find((device) => device._id === 'current-device') ?? previous[0];
        const timestamp = nowIso();
        set({ data: previous.map((device) => device._id === current._id ? { ...device, revokedAt: null, updatedAt: timestamp } : { ...device, revokedAt: timestamp, updatedAt: timestamp }), error: null });
        try {
          await trySettingsDelete<void>('/api/account/devices');
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not revoke devices', error);
        }
      },
      reset: (userId) => set({ data: [defaultDevice(userId || 'anonymous')], error: null }),
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
