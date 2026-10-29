/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useAiSettingsStore.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { nowIso, stableDefault } from './settingsStoreUtils';
import { recordSettingsAction } from './useSettingsAuditStore';
import type { AiSettings } from './types';

interface AiSettingsStore {
  data: Record<string, AiSettings>;
  getData: (workspaceId: string) => AiSettings;
  update: (workspaceId: string, patch: Partial<AiSettings>) => void;
  reset: (workspaceId: string) => void;
}

const STORE_NAME = 'osionos:settings:ai';

export function defaultAiSettings(workspaceId: string): AiSettings {
  return {
    workspaceId,
    connectors: false,
    meetingNotesAutoRecord: false,
    searchEverywhereIndexing: false,
    summaries: true,
    accountContext: true,
    updatedAt: nowIso(),
  };
}

export const useAiSettingsStore = create<AiSettingsStore>()(
  persist(
    (set, get) => ({
      data: {},
      getData: (workspaceId) => {
        const key = workspaceId || 'local-workspace';
        const stored = get().data[key];
        if (!stored) return stableDefault(`ai:${key}`, () => defaultAiSettings(key));
        if (stored.accountContext === undefined) return { ...stored, accountContext: true };
        return stored;
      },
      update: (workspaceId, patch) => {
        const current = get().getData(workspaceId);
        const next = { ...current, ...patch, updatedAt: nowIso() };
        set((state) => ({ data: { ...state.data, [workspaceId]: next } }));
        recordSettingsAction('ai_settings_update', { workspaceId, patch });
      },
      reset: (workspaceId) => {
        set((state) => ({ data: { ...state.data, [workspaceId]: defaultAiSettings(workspaceId || 'local-workspace') } }));
        recordSettingsAction('ai_settings_reset', { workspaceId });
      },
    }),
    {
      name: STORE_NAME,
      version: 1,
      migrate: (persistedState: unknown) => {
        const state = (persistedState ?? {}) as { data?: Record<string, { accountContext?: boolean }> };
        if (state.data) {
          for (const key of Object.keys(state.data)) {
            const row = state.data[key];
            if (row && row.accountContext === undefined) row.accountContext = true;
          }
        }
        return persistedState;
      },
    },
  ),
);