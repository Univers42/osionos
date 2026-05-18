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
    { name: STORE_NAME },
  ),
);

export function recordSettingsAction(action: string, metadata?: Record<string, unknown>) {
  useSettingsAuditStore.getState().record(action, metadata);
}