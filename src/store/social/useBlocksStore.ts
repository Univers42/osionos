/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useBlocksStore.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { blockUser, listBlocks, unblockUser } from '@/shared/social/blockApi';
import { errorMessage, pushSettingsError } from '@/store/settings/settingsStoreUtils';
import type { BlockedUser } from '@/store/social/types';

interface BlocksStore {
  data: BlockedUser[];
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  block: (userId: string, reason?: string) => Promise<void>;
  unblock: (userId: string) => Promise<void>;
}

const STORE_NAME = 'osionos:social:blocks';

export const useBlocksStore = create<BlocksStore>()(
  persist(
    (set, get) => ({
      data: [],
      loading: false,
      error: null,
      hydrate: async () => {
        set({ loading: true, error: null });
        try {
          const blocks = await listBlocks();
          set({ data: blocks, loading: false, error: null });
        } catch (error) {
          set({ loading: false, error: errorMessage(error) });
          pushSettingsError('Blocked list unavailable', error);
        }
      },
      block: async (userId, reason) => {
        const optimistic: BlockedUser = { userId, reason: reason ?? null };
        set({ data: [optimistic, ...get().data.filter((item) => item.userId !== userId)] });
        try {
          const saved = await blockUser(userId, reason);
          if (saved) set({ data: [saved, ...get().data.filter((item) => item.userId !== userId)] });
        } catch (error) {
          set({ data: get().data.filter((item) => item.userId !== userId), error: errorMessage(error) });
          pushSettingsError('Could not block user', error);
        }
      },
      unblock: async (userId) => {
        const previous = get().data;
        set({ data: previous.filter((item) => item.userId !== userId) });
        try {
          await unblockUser(userId);
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not unblock user', error);
        }
      },
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
