/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useUserPreferencesStore.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultPreferences } from './defaults';
import { errorMessage, nowIso, pushSettingsError, scheduleSettingsWrite, trySettingsGet, trySettingsPatch, trySettingsPost } from './settingsStoreUtils';
import type { UserPreferences } from './types';

interface UserPreferencesStore {
  data: UserPreferences | null;
  loading: boolean;
  error: string | null;
  hydrate: (userId: string) => Promise<void>;
  update: (patch: Partial<UserPreferences>) => void;
  reset: (userId: string) => Promise<void>;
}

const STORE_NAME = 'osionos:settings:preferences';

export const useUserPreferencesStore = create<UserPreferencesStore>()(
  persist(
    (set, get) => ({
      data: null,
      loading: false,
      error: null,
      hydrate: async (userId) => {
        if (!userId) return;
        set({ loading: true, error: null });
        try {
          const remote = await trySettingsGet<UserPreferences>('/api/preferences');
          set({ data: remote ?? get().data ?? defaultPreferences(userId), loading: false, error: null });
        } catch (error) {
          set({ data: get().data ?? defaultPreferences(userId), loading: false, error: errorMessage(error) });
          pushSettingsError('Preferences unavailable', error);
        }
      },
      update: (patch) => {
        const previous = get().data;
        if (!previous) return;
        const next = { ...previous, ...patch, updatedAt: nowIso() };
        set({ data: next, error: null });
        scheduleSettingsWrite(`${STORE_NAME}:${previous.userId}`, async () => {
          try {
            const remote = await trySettingsPatch<UserPreferences>('/api/preferences', patch);
            if (remote) set({ data: remote, error: null });
          } catch (error) {
            set({ data: previous, error: errorMessage(error) });
            pushSettingsError('Could not save preferences', error);
          }
        });
      },
      reset: async (userId) => {
        const previous = get().data;
        const next = defaultPreferences(userId || 'anonymous');
        set({ data: next, error: null });
        try {
          const remote = await trySettingsPost<UserPreferences>('/api/preferences/reset', {});
          if (remote) set({ data: remote, error: null });
        } catch (error) {
          set({ data: previous ?? next, error: errorMessage(error) });
          pushSettingsError('Could not reset preferences', error);
        }
      },
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
