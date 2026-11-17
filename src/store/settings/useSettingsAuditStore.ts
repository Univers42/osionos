/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSettingsAuditStore.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { noticingJsonStorage } from '@/shared/lib/storage-full/noticingWrite';
import { setItemEvictingPageCaches } from '@/store/pageStore.helpers';

import { createLocalId, nowIso, trySettingsPost } from './settingsStoreUtils';
import type { SettingsActionLogEntry } from './types';

interface SettingsAuditStore {
  entries: SettingsActionLogEntry[];
  record: (action: string, metadata?: Record<string, unknown>) => void;
  clear: () => void;
}

const STORE_NAME = 'osionos:settings:audit-actions';

export const useSettingsAuditStore = create<SettingsAuditStore>()(
  persist(
    (set) => ({
      entries: [],
      record: (action, metadata) => {
        const entry: SettingsActionLogEntry = {
          _id: createLocalId('settings-action'),
          action,
          metadata,
          createdAt: nowIso(),
        };
        set((state) => ({ entries: [entry, ...state.entries].slice(0, 200) }));
        void trySettingsPost('/api/settings/actions', { action, metadata, createdAt: entry.createdAt }).catch(() => undefined);
      },
      clear: () => set({ entries: [] }),
    }),
    // Caveat: a refused write evicts every workspace page cache (refetched on open) and may still
    // be refused; the state then lives in memory this session and the refusal is shown once.
    { name: STORE_NAME, storage: noticingJsonStorage('Settings history', setItemEvictingPageCaches) },
  ),
);

export function recordSettingsAction(action: string, metadata?: Record<string, unknown>) {
  useSettingsAuditStore.getState().record(action, metadata);
}