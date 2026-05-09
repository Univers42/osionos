import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultAccountSettings } from './defaults';
import { errorMessage, nowIso, pushSettingsError, scheduleSettingsWrite, trySettingsGet, trySettingsPatch } from './settingsStoreUtils';
import type { AccountSettings } from './types';

interface AccountSettingsStore {
  data: AccountSettings | null;
  loading: boolean;
  error: string | null;
  hydrate: (userId: string, name?: string) => Promise<void>;
  update: (patch: Partial<AccountSettings>) => void;
  reset: (userId: string, name?: string) => Promise<void>;
}

const STORE_NAME = 'osionos:settings:account';

function fallback(userId: string, name?: string): AccountSettings {
  return defaultAccountSettings(userId || 'anonymous', name);
}

export const useAccountSettingsStore = create<AccountSettingsStore>()(
  persist(
    (set, get) => ({
      data: null,
      loading: false,
      error: null,
      hydrate: async (userId, name) => {
        if (!userId) return;
        set({ loading: true, error: null });
        try {
          const remote = await trySettingsGet<AccountSettings>('/api/account/settings');
          set({ data: remote ?? get().data ?? fallback(userId, name), loading: false, error: null });
        } catch (error) {
          set({ data: get().data ?? fallback(userId, name), loading: false, error: errorMessage(error) });
          pushSettingsError('Account settings unavailable', error);
        }
      },
      update: (patch) => {
        const previous = get().data;
        if (!previous) return;
        const next = {
          ...previous,
          ...patch,
          profile: { ...previous.profile, ...patch.profile },
          security: { ...previous.security, ...patch.security },
          updatedAt: nowIso(),
        };
        set({ data: next, error: null });
        scheduleSettingsWrite(`${STORE_NAME}:${previous.userId}`, async () => {
          try {
            const remote = await trySettingsPatch<AccountSettings>('/api/account/settings', patch);
            if (remote) set({ data: remote, error: null });
          } catch (error) {
            set({ data: previous, error: errorMessage(error) });
            pushSettingsError('Could not save account settings', error);
          }
        });
      },
      reset: async (userId, name) => {
        const previous = get().data;
        const next = fallback(userId, name);
        set({ data: next, error: null });
        try {
          const remote = await trySettingsPatch<AccountSettings>('/api/account/settings', next);
          if (remote) set({ data: remote, error: null });
        } catch (error) {
          set({ data: previous ?? next, error: errorMessage(error) });
          pushSettingsError('Could not reset account settings', error);
        }
      },
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
