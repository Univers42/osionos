/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useWorkspaceSettingsStore.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { resolveWorkspaceConfig, useWorkspaceConfigStore, workspaceConfigKey } from '@/shared/config/workspaceConfigStore';
import { defaultWorkspaceSettings } from './defaults';
import { errorMessage, nowIso, pushSettingsError, scheduleSettingsWrite, stableDefault, trySettingsGet, trySettingsPatch } from './settingsStoreUtils';
import type { WorkspaceSettings } from './types';

// icon: null asks the server to remove the stored icon (a missing key is not sent).
type WorkspaceSettingsPatch = Omit<Partial<WorkspaceSettings>, 'icon'> & { icon?: string | null };

interface WorkspaceSettingsStore {
  data: Record<string, WorkspaceSettings>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  getData: (workspaceId: string, name?: string) => WorkspaceSettings;
  hydrate: (userId: string, workspaceId: string, name?: string) => Promise<void>;
  update: (userId: string, workspaceId: string, patch: WorkspaceSettingsPatch) => void;
  removeIcon: (userId: string, workspaceId: string) => void;
  reset: (userId: string, workspaceId: string, name?: string) => Promise<void>;
}

const STORE_NAME = 'osionos:settings:workspace';

function mergeSettings(current: WorkspaceSettings, patch: WorkspaceSettingsPatch): WorkspaceSettings {
  const { icon, ...rest } = patch;
  const merged = {
    ...current,
    ...rest,
    sidebar: { ...current.sidebar, ...patch.sidebar },
    analytics: { ...current.analytics, ...patch.analytics },
    publicDomains: patch.publicDomains ?? current.publicDomains ?? [],
    updatedAt: nowIso(),
  };
  if (icon === null) delete merged.icon;
  else if (icon !== undefined) merged.icon = icon;
  return merged;
}

function sidebarSettings(settings: WorkspaceSettings) {
  const sidebar = settings.sidebar as { newSidebar?: unknown; collapsed?: unknown; showApps?: unknown };
  return {
    newSidebar: typeof sidebar.newSidebar === 'boolean' ? sidebar.newSidebar : sidebar.collapsed !== true,
    showApps: typeof sidebar.showApps === 'boolean' ? sidebar.showApps : true,
  };
}

function analyticsSettings(settings: WorkspaceSettings) {
  const analytics = settings.analytics as { pageViews?: unknown; enabled?: unknown };
  return {
    pageViews: typeof analytics.pageViews === 'boolean' ? analytics.pageViews : analytics.enabled !== false,
  };
}

function syncWorkspaceConfig(userId: string, workspaceId: string, settings: WorkspaceSettings) {
  if (!userId || !workspaceId) return;
  const key = workspaceConfigKey(userId, workspaceId);
  const store = useWorkspaceConfigStore.getState();
  const current = resolveWorkspaceConfig(store.configs[key]);
  useWorkspaceConfigStore.setState({
    configs: {
      ...store.configs,
      [key]: {
        ...current,
        name: settings.name,
        icon: settings.icon,
        landingPageId: settings.landingPageId,
        sidebar: sidebarSettings(settings),
        analytics: analyticsSettings(settings),
      },
    },
  });
}

export const useWorkspaceSettingsStore = create<WorkspaceSettingsStore>()(
  persist(
    (set, get) => ({
      data: {},
      loading: {},
      error: {},
      getData: (workspaceId, name) => get().data[workspaceId] ?? stableDefault(`workspace:${workspaceId || 'local-workspace'}:${name ?? ''}`, () => defaultWorkspaceSettings(workspaceId || 'local-workspace', name)),
      hydrate: async (userId, workspaceId, name) => {
        if (!workspaceId) return;
        set((state) => ({ loading: { ...state.loading, [workspaceId]: true }, error: { ...state.error, [workspaceId]: null } }));
        try {
          const remote = await trySettingsGet<WorkspaceSettings>(`/api/workspaces/${encodeURIComponent(workspaceId)}/settings`);
          const next = remote ?? get().data[workspaceId] ?? defaultWorkspaceSettings(workspaceId, name);
          set((state) => ({
            data: { ...state.data, [workspaceId]: next },
            loading: { ...state.loading, [workspaceId]: false },
            error: { ...state.error, [workspaceId]: null },
          }));
          syncWorkspaceConfig(userId, workspaceId, next);
        } catch (error) {
          const next = get().data[workspaceId] ?? defaultWorkspaceSettings(workspaceId, name);
          set((state) => ({
            data: { ...state.data, [workspaceId]: next },
            loading: { ...state.loading, [workspaceId]: false },
            error: { ...state.error, [workspaceId]: errorMessage(error) },
          }));
          pushSettingsError('Workspace settings unavailable', error);
        }
      },
      update: (userId, workspaceId, patch) => {
        if (!workspaceId) return;
        const previous = get().data[workspaceId] ?? defaultWorkspaceSettings(workspaceId);
        const next = mergeSettings(previous, patch);
        set((state) => ({ data: { ...state.data, [workspaceId]: next }, error: { ...state.error, [workspaceId]: null } }));
        syncWorkspaceConfig(userId, workspaceId, next);
        const remotePatch = Object.fromEntries(
          Object.entries(patch).filter(([key]) => ['name', 'icon', 'landingPageId', 'sidebar', 'analytics'].includes(key)),
        );
        scheduleSettingsWrite(`${STORE_NAME}:${workspaceId}`, async () => {
          try {
            const remote = await trySettingsPatch<WorkspaceSettings>(`/api/workspaces/${encodeURIComponent(workspaceId)}/settings`, remotePatch);
            if (remote) {
              set((state) => ({ data: { ...state.data, [workspaceId]: remote }, error: { ...state.error, [workspaceId]: null } }));
              syncWorkspaceConfig(userId, workspaceId, remote);
            }
          } catch (error) {
            set((state) => ({ data: { ...state.data, [workspaceId]: previous }, error: { ...state.error, [workspaceId]: errorMessage(error) } }));
            syncWorkspaceConfig(userId, workspaceId, previous);
            pushSettingsError('Could not save workspace settings', error);
          }
        });
      },
      removeIcon: (userId, workspaceId) => get().update(userId, workspaceId, { icon: null }),
      reset: async (userId, workspaceId, name) => {
        if (!workspaceId) return;
        const previous = get().data[workspaceId];
        const next = defaultWorkspaceSettings(workspaceId, name);
        set((state) => ({ data: { ...state.data, [workspaceId]: next }, error: { ...state.error, [workspaceId]: null } }));
        syncWorkspaceConfig(userId, workspaceId, next);
        const remoteBody = {
          name: next.name,
          icon: next.icon,
          landingPageId: next.landingPageId,
          sidebar: next.sidebar,
          analytics: next.analytics,
        };
        try {
          const remote = await trySettingsPatch<WorkspaceSettings>(`/api/workspaces/${encodeURIComponent(workspaceId)}/settings`, remoteBody);
          if (remote) {
            set((state) => ({ data: { ...state.data, [workspaceId]: remote }, error: { ...state.error, [workspaceId]: null } }));
            syncWorkspaceConfig(userId, workspaceId, remote);
          }
        } catch (error) {
          set((state) => ({ data: { ...state.data, [workspaceId]: previous ?? next }, error: { ...state.error, [workspaceId]: errorMessage(error) } }));
          pushSettingsError('Could not reset workspace settings', error);
        }
      },
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
