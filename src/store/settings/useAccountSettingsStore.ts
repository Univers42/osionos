/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAccountSettingsStore.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { currentAccountEpoch } from './accountEpoch';
import { unknownAccountSettings } from './defaults';
import { errorMessage, pushSettingsError, scheduleSettingsWrite, trySettingsGet, trySettingsPatch } from './settingsStoreUtils';
import type { AccountSettings } from './types';

interface AccountSettingsStore {
  data: AccountSettings | null;
  loading: boolean;
  error: string | null;
  hydrate: (userId: string) => Promise<void>;
  update: (patch: Partial<AccountSettings>) => void;
}

const STORE_NAME = 'osionos:settings:account';

export const useAccountSettingsStore = create<AccountSettingsStore>()(
  persist(
    (set, get) => ({
      data: null,
      loading: false,
      error: null,
      hydrate: async (userId) => {
        if (!userId) return;
        // Another user's persisted object must not show while this one loads or fails.
        if (get().data && get().data?.userId !== userId) set({ data: null });
        set({ loading: true, error: null });
        const epoch = currentAccountEpoch();
        try {
          const remote = await trySettingsGet<AccountSettings>('/api/account/settings');
          if (epoch !== currentAccountEpoch()) return;
          // Stored as received: an absent key stays unknown, never a default.
          set({ data: remote ?? unknownAccountSettings(userId), loading: false, error: null });
        } catch (error) {
          if (epoch !== currentAccountEpoch()) return;
          set({ data: unknownAccountSettings(userId), loading: false, error: errorMessage(error) });
          pushSettingsError('Account settings unavailable', error);
        }
      },
      update: (patch) => {
        const previous = get().data;
        if (!previous) return;
        set({ data: { ...previous, ...patch, security: { ...previous.security, ...patch.security } }, error: null });
        // The server takes exactly this one key; the rest of `security` is read-only there.
        const preferredMfaMethod = patch.security?.preferredMfaMethod;
        if (preferredMfaMethod === undefined) return;
        const epoch = currentAccountEpoch();
        scheduleSettingsWrite(`${STORE_NAME}:${previous.userId}`, async () => {
          try {
            const remote = await trySettingsPatch<AccountSettings>('/api/account/settings', { security: { preferredMfaMethod } });
            if (remote && epoch === currentAccountEpoch()) set({ data: remote, error: null });
          } catch (error) {
            if (epoch !== currentAccountEpoch()) return;
            set({ data: previous, error: errorMessage(error) });
            pushSettingsError('Could not save account settings', error);
          }
        });
      },
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
