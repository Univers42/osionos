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
    themeName: 'Clean Paper',
    tokens: {
      ink: '#2f2d29',
      muted: '#6f6a60',
      surface: '#fffdf8',
      surfaceSecondary: '#f7f2e8',
      surfaceHover: '#eee7da',
      accent: '#2563eb',
      line: '#e7dcc8',
    },
  },
  {
    themeName: 'Graphite',
    tokens: {
      ink: '#f5f5f5',
      muted: '#a3a3a3',
      surface: '#18181b',
      surfaceSecondary: '#27272a',
      surfaceHover: '#3f3f46',
      accent: '#8b5cf6',
      line: '#3f3f46',
    },
  },
  {
    themeName: 'Ocean',
    tokens: {
      ink: '#102a43',
      muted: '#486581',
      surface: '#f0f9ff',
      surfaceSecondary: '#e0f2fe',
      surfaceHover: '#bae6fd',
      accent: '#0284c7',
      line: '#7dd3fc',
    },
  },
  {
    themeName: 'Forest',
    tokens: {
      ink: '#1f2933',
      muted: '#52606d',
      surface: '#f7fee7',
      surfaceSecondary: '#ecfccb',
      surfaceHover: '#d9f99d',
      accent: '#65a30d',
      line: '#bef264',
    },
  },
  {
    themeName: 'Midnight',
    tokens: {
      ink: '#e5e7eb',
      muted: '#9ca3af',
      surface: '#0f172a',
      surfaceSecondary: '#111827',
      surfaceHover: '#1f2937',
      accent: '#38bdf8',
      line: '#334155',
    },
  },
  {
    themeName: 'Dracula',
    tokens: {
      ink: '#f8f8f2',
      muted: '#b8b8c8',
      surface: '#282a36',
      surfaceSecondary: '#343746',
      surfaceHover: '#44475a',
      accent: '#bd93f9',
      line: '#44475a',
    },
  },
  {
    themeName: 'Solarized Light',
    tokens: {
      ink: '#586e75',
      muted: '#839496',
      surface: '#fdf6e3',
      surfaceSecondary: '#eee8d5',
      surfaceHover: '#e6dfc8',
      accent: '#268bd2',
      line: '#d6cfbd',
    },
  },
  {
    themeName: 'Solarized Dark',
    tokens: {
      ink: '#eee8d5',
      muted: '#93a1a1',
      surface: '#002b36',
      surfaceSecondary: '#073642',
      surfaceHover: '#0b4250',
      accent: '#2aa198',
      line: '#174652',
    },
  },
  {
    themeName: 'Rose Pine',
    tokens: {
      ink: '#e0def4',
      muted: '#908caa',
      surface: '#191724',
      surfaceSecondary: '#1f1d2e',
      surfaceHover: '#26233a',
      accent: '#ebbcba',
      line: '#403d52',
    },
  },
  {
    themeName: 'Nord',
    tokens: {
      ink: '#eceff4',
      muted: '#d8dee9',
      surface: '#2e3440',
      surfaceSecondary: '#3b4252',
      surfaceHover: '#434c5e',
      accent: '#88c0d0',
      line: '#4c566a',
    },
  },
  {
    themeName: 'Catppuccin',
    tokens: {
      ink: '#cdd6f4',
      muted: '#bac2de',
      surface: '#1e1e2e',
      surfaceSecondary: '#313244',
      surfaceHover: '#45475a',
      accent: '#cba6f7',
      line: '#585b70',
    },
  },
  {
    themeName: 'Latte',
    tokens: {
      ink: '#4c4f69',
      muted: '#6c6f85',
      surface: '#eff1f5',
      surfaceSecondary: '#e6e9ef',
      surfaceHover: '#dce0e8',
      accent: '#1e66f5',
      line: '#ccd0da',
    },
  },
  {
    themeName: 'Sepia',
    tokens: {
      ink: '#433422',
      muted: '#7c6f64',
      surface: '#fbf0d9',
      surfaceSecondary: '#f2e4c8',
      surfaceHover: '#ead8b8',
      accent: '#af5f00',
      line: '#dec79d',
    },
  },
  {
    themeName: 'Candy',
    tokens: {
      ink: '#451a3a',
      muted: '#9d4b82',
      surface: '#fff1f8',
      surfaceSecondary: '#ffe4f1',
      surfaceHover: '#fecddf',
      accent: '#db2777',
      line: '#f9a8d4',
    },
  },
  {
    themeName: 'Amber Night',
    tokens: {
      ink: '#fef3c7',
      muted: '#fbbf24',
      surface: '#1c1917',
      surfaceSecondary: '#292524',
      surfaceHover: '#44403c',
      accent: '#f59e0b',
      line: '#57534e',
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
    '--color-ink',
    '--color-ink-muted',
    '--color-surface-primary',
    '--color-surface-secondary',
    '--color-surface-hover',
    '--color-accent',
    '--color-line',
    '--color-border',
    '--color-surface',
  ].forEach((name) => root.style.removeProperty(name));
}

export function applyWorkspaceAppearance(appearance: WorkspaceAppearance) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--color-ink', appearance.tokens.ink);
  root.style.setProperty('--color-ink-muted', appearance.tokens.muted);
  root.style.setProperty('--color-surface-primary', appearance.tokens.surface);
  root.style.setProperty('--color-surface-secondary', appearance.tokens.surfaceSecondary);
  root.style.setProperty('--color-surface-hover', appearance.tokens.surfaceHover);
  root.style.setProperty('--color-accent', appearance.tokens.accent);
  root.style.setProperty('--color-line', appearance.tokens.line);
  root.style.setProperty('--color-border', appearance.tokens.line);
  root.style.setProperty('--color-surface', appearance.tokens.surface);
}
