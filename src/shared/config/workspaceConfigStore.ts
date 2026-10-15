/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceConfigStore.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:24:39 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/09 18:16:10 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api, getActiveJwt } from '@/shared/api/client';
import { chatBridgeAvailable, createChannel as createBridgeChannel } from '@/shared/chat/channelApi';

export type WorkspaceChannelType = 'text' | 'thread' | 'forum' | 'audio' | 'video' | 'stage' | 'archive' | 'agent';
export type WorkspaceChannelVisibility = 'workspace' | 'members';

export interface WorkspaceChannel {
  id: string;
  workspaceId: string;
  parentChannelId?: string | null;
  name: string;
  type: WorkspaceChannelType;
  visibility: WorkspaceChannelVisibility;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceThemeTokens {
  ink: string;
  muted: string;
  surface: string;
  surfaceSecondary: string;
  surfaceHover: string;
  accent: string;
  line: string;
}

export interface WorkspaceAppearance {
  themeName: string;
  tokens: WorkspaceThemeTokens;
}

export interface WorkspaceSidebarSettings {
  newSidebar: boolean;
  showApps: boolean;
}

export interface WorkspaceAnalyticsSettings {
  pageViews: boolean;
}

export interface WorkspaceSettingsFields {
  name?: string;
  icon?: string;
  landingPageId?: string | null;
  sidebar: WorkspaceSidebarSettings;
  analytics: WorkspaceAnalyticsSettings;
}

export interface WorkspaceConfig {
  channels: WorkspaceChannel[];
  /** Saved by versions before palettes existed. No longer applied (it wrote
   *  colours inline on <html>, above every palette); kept only so a save
   *  round-trips what the server has. */
  appearance?: WorkspaceAppearance | null;
  name?: string;
  icon?: string;
  landingPageId?: string | null;
  sidebar?: WorkspaceSidebarSettings;
  analytics?: WorkspaceAnalyticsSettings;
}

interface WorkspaceConfigStore {
  configs: Record<string, WorkspaceConfig>;
  getConfig: (userId: string, workspaceId: string) => WorkspaceConfig;
  addChannel: (userId: string, workspaceId: string, name?: string, type?: WorkspaceChannelType, parentChannelId?: string | null) => Promise<WorkspaceChannel>;
  addThread: (userId: string, workspaceId: string, parentChannelId: string, name?: string) => Promise<WorkspaceChannel>;
  updateChannel: (userId: string, workspaceId: string, channelId: string, updates: Partial<WorkspaceChannel>) => Promise<void>;
  updateSettings: (userId: string, workspaceId: string, updates: Partial<WorkspaceSettingsFields>) => Promise<void>;
  resetSettings: (userId: string, workspaceId: string, defaults?: Partial<WorkspaceSettingsFields>) => Promise<void>;
  clearAppearance: (userId: string, workspaceId: string) => Promise<void>;
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettingsFields = {
  icon: '🌏',
  landingPageId: null,
  sidebar: { newSidebar: true, showApps: true },
  analytics: { pageViews: true },
};

export function workspaceConfigKey(userId: string, workspaceId: string): string {
  return `${userId}:${workspaceId}`;
}

export function resolveWorkspaceConfig(config?: WorkspaceConfig): WorkspaceConfig {
  return {
    channels: config?.channels ?? [],
    appearance: config?.appearance ?? null,
    name: config?.name,
    icon: config?.icon ?? DEFAULT_WORKSPACE_SETTINGS.icon,
    landingPageId: config?.landingPageId ?? DEFAULT_WORKSPACE_SETTINGS.landingPageId,
    sidebar: { ...DEFAULT_WORKSPACE_SETTINGS.sidebar, ...config?.sidebar },
    analytics: { ...DEFAULT_WORKSPACE_SETTINGS.analytics, ...config?.analytics },
  };
}

async function persistWorkspaceConfigToApi(workspaceId: string, config: WorkspaceConfig) {
  const jwt = getActiveJwt();
  if (!jwt) return;
  try {
    await api.patch(`/api/workspaces/${workspaceId}/config`, { config }, jwt);
  } catch {
    // Offline mode keeps local persisted config. Mongo endpoint can sync later.
  }
}

/**
 * Workspace channel types the bridge has a kind for. Everything else (thread,
 * forum, stage, archive, agent) is a text channel there — its createChannel
 * coerces any unknown kind to 'text' — while this store keeps the richer type.
 */
const BRIDGE_CHANNEL_KIND: Partial<Record<WorkspaceChannelType, string>> = {
  text: 'text',
  audio: 'voice',
  video: 'video',
};

/**
 * A channel id the chat bridge will recognise.
 *
 * This used to be `channel-${crypto.randomUUID()}`, an id that existed nowhere
 * but this store: opening such a channel made every chat widget poll
 * /api/chat/channels/<id>/{messages,read,receipts} for a row that was never
 * created, so the console filled with 404s and no message could ever load.
 * The channel is now created through the same endpoint CreateChannelModal
 * uses, and we keep the uuid it returns.
 *
 * With no bridge session (offline) or on a failed create we fall back to the
 * old local id, so offline mode still gets a channel — one that stays
 * local-only, and 404s the same way, until it is recreated online.
 */
async function bridgeChannelId(
  workspaceId: string,
  name: string,
  type: WorkspaceChannelType,
): Promise<string> {
  if (!chatBridgeAvailable()) return `channel-${crypto.randomUUID()}`;
  try {
    const created = await createBridgeChannel({
      workspaceId,
      name,
      kind: BRIDGE_CHANNEL_KIND[type] ?? 'text',
    });
    return created.id;
  } catch {
    return `channel-${crypto.randomUUID()}`;
  }
}

export const useWorkspaceConfigStore = create<WorkspaceConfigStore>()(
  persist(
    (set, get) => ({
      configs: {},
      getConfig: (userId, workspaceId) => resolveWorkspaceConfig(get().configs[workspaceConfigKey(userId, workspaceId)]),
      addChannel: async (userId, workspaceId, name = 'new-channel', type = 'text', parentChannelId = null) => {
        const key = workspaceConfigKey(userId, workspaceId);
        const current = resolveWorkspaceConfig(get().configs[key]);
        const now = new Date().toISOString();
        const channel: WorkspaceChannel = {
          id: await bridgeChannelId(workspaceId, name, type),
          workspaceId,
          parentChannelId,
          name,
          type,
          visibility: 'workspace',
          memberIds: [],
          createdAt: now,
          updatedAt: now,
        };
        const nextConfig = { ...current, channels: [...current.channels, channel] };
        set((state) => ({ configs: { ...state.configs, [key]: nextConfig } }));
        await persistWorkspaceConfigToApi(workspaceId, nextConfig);
        return channel;
      },
      addThread: async (userId, workspaceId, parentChannelId, name = 'new-thread') => {
        return get().addChannel(userId, workspaceId, name, 'thread', parentChannelId);
      },
      updateChannel: async (userId, workspaceId, channelId, updates) => {
        const key = workspaceConfigKey(userId, workspaceId);
        const current = resolveWorkspaceConfig(get().configs[key]);
        const nextConfig = {
          ...current,
          channels: current.channels.map((channel) => channel.id === channelId
            ? { ...channel, ...updates, updatedAt: new Date().toISOString() }
            : channel),
        };
        set((state) => ({ configs: { ...state.configs, [key]: nextConfig } }));
        await persistWorkspaceConfigToApi(workspaceId, nextConfig);
      },
      updateSettings: async (userId, workspaceId, updates) => {
        const key = workspaceConfigKey(userId, workspaceId);
        const current = resolveWorkspaceConfig(get().configs[key]);
        const nextConfig: WorkspaceConfig = {
          ...current,
          ...updates,
          sidebar: { ...DEFAULT_WORKSPACE_SETTINGS.sidebar, ...current.sidebar, ...updates.sidebar },
          analytics: { ...DEFAULT_WORKSPACE_SETTINGS.analytics, ...current.analytics, ...updates.analytics },
        };
        set((state) => ({ configs: { ...state.configs, [key]: nextConfig } }));
        await persistWorkspaceConfigToApi(workspaceId, nextConfig);
      },
      resetSettings: async (userId, workspaceId, defaults = {}) => {
        const key = workspaceConfigKey(userId, workspaceId);
        const current = resolveWorkspaceConfig(get().configs[key]);
        const nextConfig = {
          ...current,
          name: defaults.name,
          icon: defaults.icon ?? DEFAULT_WORKSPACE_SETTINGS.icon,
          landingPageId: defaults.landingPageId ?? DEFAULT_WORKSPACE_SETTINGS.landingPageId,
          sidebar: { ...DEFAULT_WORKSPACE_SETTINGS.sidebar, ...defaults.sidebar },
          analytics: { ...DEFAULT_WORKSPACE_SETTINGS.analytics, ...defaults.analytics },
        };
        set((state) => ({ configs: { ...state.configs, [key]: nextConfig } }));
        await persistWorkspaceConfigToApi(workspaceId, nextConfig);
      },
      clearAppearance: async (userId, workspaceId) => {
        const key = workspaceConfigKey(userId, workspaceId);
        const current = resolveWorkspaceConfig(get().configs[key]);
        const nextConfig = { ...current, appearance: null };
        set((state) => ({ configs: { ...state.configs, [key]: nextConfig } }));
        await persistWorkspaceConfigToApi(workspaceId, nextConfig);
      },
    }),
    { name: 'osionos:workspace-configurations' },
  ),
);
