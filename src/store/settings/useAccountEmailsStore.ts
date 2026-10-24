/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAccountEmailsStore.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultEmail, primaryEmailId } from './defaults';
import { errorMessage, pushSettingsError, trySettingsGet } from './settingsStoreUtils';
import type { EmailRecord } from './types';

interface AccountEmailsStore {
  data: EmailRecord[];
  loading: boolean;
  error: string | null;
  hydrate: (userId: string, email?: string) => Promise<void>;
  reset: (userId: string, email?: string) => void;
}

const STORE_NAME = 'osionos:settings:account-emails';

// Adding, removing and changing the primary address are not served yet, so this store only
// reads: no local state stands in for a server answer.
export const useAccountEmailsStore = create<AccountEmailsStore>()(
  persist(
    (set, get) => ({
      data: [],
      loading: false,
      error: null,
      hydrate: async (userId, email) => {
        if (!userId) return;
        // Drops another user's rows and the fake `email-*` rows older builds persisted.
        set({ data: get().data.filter((record) => record._id === primaryEmailId(userId)), loading: true, error: null });
        const sessionRow = email ? [defaultEmail(userId, email)] : [];
        try {
          const remote = await trySettingsGet<EmailRecord[]>('/api/account/emails');
          set({ data: remote ?? sessionRow, loading: false, error: null });
        } catch (error) {
          set({ data: sessionRow, loading: false, error: errorMessage(error) });
          pushSettingsError('Emails unavailable', error);
        }
      },
      reset: (userId, email) => set({ data: email ? [defaultEmail(userId || 'anonymous', email)] : [], error: null }),
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
