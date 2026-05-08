/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspaceConfigStore.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:24:39 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/08 03:50:35 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/shared/api/client';
import { useUserStore } from '@/features/auth/model/useUserStore';

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

export interface WorkspaceConfig {
  channels: WorkspaceChannel[];
  appearance?: WorkspaceAppearance | null;
}

interface WorkspaceConfigStore {
  configs: Record<string, WorkspaceConfig>;
  getConfig: (userId: string, workspaceId: string) => WorkspaceConfig;
  addChannel: (userId: string, workspaceId: string, name?: string, type?: WorkspaceChannelType, parentChannelId?: string | null) => Promise<WorkspaceChannel>;
  addThread: (userId: string, workspaceId: string, parentChannelId: string, name?: string) => Promise<WorkspaceChannel>;
  updateChannel: (userId: string, workspaceId: string, channelId: string, updates: Partial<WorkspaceChannel>) => Promise<void>;
  updateAppearance: (userId: string, workspaceId: string, appearance: WorkspaceAppearance) => Promise<void>;
  clearAppearance: (userId: string, workspaceId: string) => Promise<void>;
}

export const DEFAULT_WORKSPACE_APPEARANCE: WorkspaceAppearance = {
  themeName: 'osionos light',
  tokens: {
    ink: '#37352f',
    muted: '#787774',
    surface: '#ffffff',
    surfaceSecondary: '#f7f6f3',
    surfaceHover: '#ebebea',
    accent: '#2383e2',
    line: '#e9e9e7',
  },
};

export const THEME_PRESETS: WorkspaceAppearance[] = [
  {
    themeName: 'Studio',
    tokens: {
      ink: '#1d2525',
      muted: '#5d6664',
      surface: '#fbfbfa',
      surfaceSecondary: '#f1f3f2',
      surfaceHover: '#e5e9e7',
      accent: '#0f766e',
      line: '#d8dedb',
    },
  },
  {
    themeName: 'Graphite Lime',
    tokens: {
      ink: '#f5f7f6',
      muted: '#aab4af',
      surface: '#17181a',
      surfaceSecondary: '#202225',
      surfaceHover: '#2b2f32',
      accent: '#a3e635',
      line: '#4b5252',
    },
  },
  {
    themeName: 'Harbor',
    tokens: {
      ink: '#17242a',
      muted: '#58707a',
      surface: '#f7fbfc',
      surfaceSecondary: '#eaf2f4',
      surfaceHover: '#dbe8eb',
      accent: '#e4572e',
      line: '#c9d8dc',
    },
  },
  {
    themeName: 'Evergreen',
    tokens: {
      ink: '#17211d',
      muted: '#607067',
      surface: '#f8faf7',
      surfaceSecondary: '#edf2ed',
      surfaceHover: '#dfe8df',
      accent: '#2f7d5c',
      line: '#cad8ce',
    },
  },
  {
    themeName: 'Slate Rose',
    tokens: {
      ink: '#f7f3f4',
      muted: '#b8adb1',
      surface: '#1b1d21',
      surfaceSecondary: '#252930',
      surfaceHover: '#303640',
      accent: '#f97373',
      line: '#505762',
    },
  },
  {
    themeName: 'Cobalt Mint',
    tokens: {
      ink: '#111827',
      muted: '#5e6b7a',
      surface: '#f8fafc',
      surfaceSecondary: '#edf4f8',
      surfaceHover: '#ddebf0',
      accent: '#0d9488',
      line: '#cbd7df',
    },
  },
  {
    themeName: 'Carbon Amber',
    tokens: {
      ink: '#f7f4ed',
      muted: '#bdb4a5',
      surface: '#191918',
      surfaceSecondary: '#242321',
      surfaceHover: '#33312c',
      accent: '#f2a93b',
      line: '#504b43',
    },
  },
  {
    themeName: 'High Contrast',
    tokens: {
      ink: '#ffffff',
      muted: '#d4d4d8',
      surface: '#000000',
      surfaceSecondary: '#111111',
      surfaceHover: '#262626',
      accent: '#ffff00',
      line: '#737373',
    },
  },
];

function readableTextOn(hexColor: string): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
  if (!match) return '#ffffff';
  const [, r, g, b] = match;
  const luminance = (0.2126 * Number.parseInt(r, 16) + 0.7152 * Number.parseInt(g, 16) + 0.0722 * Number.parseInt(b, 16)) / 255;
  return luminance > 0.58 ? '#111827' : '#ffffff';
}

export function workspaceConfigKey(userId: string, workspaceId: string): string {
  return `${userId}:${workspaceId}`;
}

export function resolveWorkspaceConfig(config?: WorkspaceConfig): WorkspaceConfig {
  const appearance = config?.appearance?.themeName === DEFAULT_WORKSPACE_APPEARANCE.themeName
    ? null
    : config?.appearance ?? null;
  return {
    channels: config?.channels ?? [],
    appearance,
  };
}

export function effectiveWorkspaceAppearance(config?: WorkspaceConfig): WorkspaceAppearance {
  return config?.appearance ?? DEFAULT_WORKSPACE_APPEARANCE;
}

async function persistWorkspaceConfigToApi(workspaceId: string, config: WorkspaceConfig) {
  const jwt = useUserStore.getState().activeJwt();
  if (!jwt) return;
  try {
    await api.patch(`/api/workspaces/${workspaceId}/config`, { config }, jwt);
  } catch {
    // Offline mode keeps local persisted config. Mongo endpoint can sync later.
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
          id: `channel-${crypto.randomUUID()}`,
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
      updateAppearance: async (userId, workspaceId, appearance) => {
        const key = workspaceConfigKey(userId, workspaceId);
        const current = resolveWorkspaceConfig(get().configs[key]);
        const nextConfig = { ...current, appearance };
        set((state) => ({ configs: { ...state.configs, [key]: nextConfig } }));
        await persistWorkspaceConfigToApi(workspaceId, nextConfig);
      },
      clearAppearance: async (userId, workspaceId) => {
        const key = workspaceConfigKey(userId, workspaceId);
        const current = resolveWorkspaceConfig(get().configs[key]);
        const nextConfig = { ...current, appearance: null };
        set((state) => ({ configs: { ...state.configs, [key]: nextConfig } }));
        clearWorkspaceAppearance();
        await persistWorkspaceConfigToApi(workspaceId, nextConfig);
      },
    }),
    { name: 'osionos:workspace-configurations' },
  ),
);

export function clearWorkspaceAppearance() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  [
    '--osio-fg-default',
    '--osio-fg-muted',
    '--osio-bg-page',
    '--osio-bg-surface',
    '--osio-bg-subtle',
    '--osio-bg-hover',
    '--osio-accent',
    '--osio-border-default',
  ].forEach((name) => root.style.removeProperty(name));
}

export function applyWorkspaceAppearance(appearance: WorkspaceAppearance) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--osio-fg-default', appearance.tokens.ink);
  root.style.setProperty('--osio-fg-muted', appearance.tokens.muted);
  root.style.setProperty('--osio-fg-subtle', appearance.tokens.muted);
  root.style.setProperty('--osio-bg-page', appearance.tokens.surface);
  root.style.setProperty('--osio-bg-surface', appearance.tokens.surface);
  root.style.setProperty('--osio-bg-subtle', appearance.tokens.surfaceSecondary);
  root.style.setProperty('--osio-bg-muted', appearance.tokens.surfaceHover);
  root.style.setProperty('--osio-bg-elevated', appearance.tokens.surface);
  root.style.setProperty('--osio-bg-hover', appearance.tokens.surfaceHover);
  root.style.setProperty('--osio-accent', appearance.tokens.accent);
  root.style.setProperty('--osio-accent-hover', appearance.tokens.accent);
  root.style.setProperty('--osio-accent-fg', readableTextOn(appearance.tokens.accent));
  root.style.setProperty('--osio-border-default', appearance.tokens.line);
  root.style.setProperty('--osio-border-strong', appearance.tokens.muted);
}
