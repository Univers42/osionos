import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { nowIso } from './settingsStoreUtils';
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
    agentsEnabled: true,
    customAgentsAllowed: false,
    searchEverywhereIndexing: false,
    summaries: true,
    updatedAt: nowIso(),
  };
}

export const useAiSettingsStore = create<AiSettingsStore>()(
  persist(
    (set, get) => ({
      data: {},
      getData: (workspaceId) => get().data[workspaceId] ?? defaultAiSettings(workspaceId || 'local-workspace'),
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
    { name: STORE_NAME },
  ),
);