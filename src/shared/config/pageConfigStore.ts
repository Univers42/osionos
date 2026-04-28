/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageConfigStore.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:24:31 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:24:32 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '@/shared/api/client';
import { useUserStore } from '@/features/auth/model/useUserStore';

export type PageFont = 'default' | 'serif' | 'mono';

export interface PageCssTokens {
  fontFamily: string;
  fontSizeScale: number;
  contentMaxWidth: string;
  contentPaddingInline: string;
}

export interface PageActionEvent {
  action: string;
  userId: string;
  pageId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface PageVersion {
  id: string;
  userId: string;
  pageId: string;
  title: string;
  content: unknown[];
  createdAt: string;
  label: string;
}

export interface PageConnection {
  id: string;
  name: string;
  status: 'connected' | 'disabled';
  updatedAt: string;
}

export interface PageAnalytics {
  views: number;
  actions: number;
  copies: number;
  imports: number;
  exports: number;
  translations: number;
  presentations: number;
  duplicates: number;
  lastActionAt?: string;
}

export interface PageConfig {
  font: PageFont;
  smallText: boolean;
  fullWidth: boolean;
  locked: boolean;
  presentationMode: boolean;
  notifications: {
    comments: boolean;
  };
  connections: PageConnection[];
  analytics: PageAnalytics;
  versions: PageVersion[];
  lastAction?: PageActionEvent;
  cssTokens: PageCssTokens;
}

interface PageConfigStore {
  configs: Record<string, PageConfig>;
  getConfig: (userId: string, pageId: string) => PageConfig;
  updateConfig: (userId: string, pageId: string, updates: Partial<PageConfig>) => Promise<void>;
  recordAction: (
    userId: string,
    pageId: string,
    action: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void>;
  addVersion: (
    userId: string,
    pageId: string,
    version: Omit<PageVersion, 'id' | 'userId' | 'pageId' | 'createdAt'>,
  ) => Promise<PageVersion>;
}

export const DEFAULT_PAGE_CONFIG: PageConfig = {
  font: 'default',
  smallText: false,
  fullWidth: false,
  locked: false,
  presentationMode: false,
  notifications: {
    comments: false,
  },
  connections: [],
  analytics: {
    views: 0,
    actions: 0,
    copies: 0,
    imports: 0,
    exports: 0,
    translations: 0,
    presentations: 0,
    duplicates: 0,
  },
  versions: [],
  cssTokens: {
    fontFamily: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSizeScale: 1,
    contentMaxWidth: '900px',
    contentPaddingInline: 'clamp(16px, 11%, 96px)',
  },
};

function buildCssTokens(config: PageConfig): PageCssTokens {
  let fontFamily = DEFAULT_PAGE_CONFIG.cssTokens.fontFamily;
  if (config.font === 'serif') fontFamily = 'Georgia, "Times New Roman", serif';
  if (config.font === 'mono') {
    fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
  }

  return {
    fontFamily,
    fontSizeScale: config.smallText ? 0.92 : 1,
    contentMaxWidth: config.fullWidth ? 'none' : '900px',
    contentPaddingInline: config.fullWidth ? 'clamp(16px, 4vw, 48px)' : 'clamp(16px, 11%, 96px)',
  };
}

export function resolvePageConfig(config?: PageConfig, updates: Partial<PageConfig> = {}): PageConfig {
  const next = {
    ...DEFAULT_PAGE_CONFIG,
    ...config,
    ...updates,
    notifications: {
      ...DEFAULT_PAGE_CONFIG.notifications,
      ...config?.notifications,
      ...updates.notifications,
    },
    analytics: {
      ...DEFAULT_PAGE_CONFIG.analytics,
      ...config?.analytics,
      ...updates.analytics,
    },
    connections: updates.connections ?? config?.connections ?? DEFAULT_PAGE_CONFIG.connections,
    versions: updates.versions ?? config?.versions ?? DEFAULT_PAGE_CONFIG.versions,
  };

  return {
    ...next,
    cssTokens: buildCssTokens(next),
  };
}

export function pageConfigKey(userId: string, pageId: string): string {
  return `${userId}:${pageId}`;
}

async function persistPageConfigToApi(pageId: string, config: PageConfig) {
  const jwt = useUserStore.getState().activeJwt();
  if (!jwt) return;

  try {
    await api.patch(`/api/pages/${pageId}/config`, { config }, jwt);
  } catch {
    // Offline mode keeps the persisted Zustand copy. The API endpoint can sync later.
  }
}

export const usePageConfigStore = create<PageConfigStore>()(
  persist(
    (set, get) => ({
      configs: {},
      getConfig: (userId, pageId) => resolvePageConfig(get().configs[pageConfigKey(userId, pageId)]),
      updateConfig: async (userId, pageId, updates) => {
        const key = pageConfigKey(userId, pageId);
        const nextConfig = resolvePageConfig(get().configs[key], updates);

        set((state) => ({
          configs: {
            ...state.configs,
            [key]: nextConfig,
          },
        }));

        await persistPageConfigToApi(pageId, nextConfig);
      },
      recordAction: async (userId, pageId, action, metadata) => {
        const key = pageConfigKey(userId, pageId);
        const current = resolvePageConfig(get().configs[key]);
        const event: PageActionEvent = {
          action,
          userId,
          pageId,
          createdAt: new Date().toISOString(),
          metadata,
        };

        const nextAnalytics: PageAnalytics = {
          ...current.analytics,
          actions: current.analytics.actions + 1,
          lastActionAt: event.createdAt,
        };
        if (action === 'copy_link' || action === 'copy_page_contents') nextAnalytics.copies += 1;
        if (action === 'import') nextAnalytics.imports += 1;
        if (action === 'export') nextAnalytics.exports += 1;
        if (action === 'translate') nextAnalytics.translations += 1;
        if (action === 'present') nextAnalytics.presentations += 1;
        if (action === 'duplicate') nextAnalytics.duplicates += 1;

        const nextConfig = resolvePageConfig(current, {
          analytics: nextAnalytics,
          lastAction: event,
        });

        set((state) => ({
          configs: {
            ...state.configs,
            [key]: nextConfig,
          },
        }));

        await persistPageConfigToApi(pageId, nextConfig);
      },
      addVersion: async (userId, pageId, version) => {
        const key = pageConfigKey(userId, pageId);
        const current = resolvePageConfig(get().configs[key]);
        const nextVersion: PageVersion = {
          ...version,
          id: crypto.randomUUID(),
          userId,
          pageId,
          createdAt: new Date().toISOString(),
        };
        const nextConfig = resolvePageConfig(current, {
          versions: [nextVersion, ...current.versions].slice(0, 20),
        });

        set((state) => ({
          configs: {
            ...state.configs,
            [key]: nextConfig,
          },
        }));

        await persistPageConfigToApi(pageId, nextConfig);
        return nextVersion;
      },
    }),
    {
      name: 'osionos:page-configurations',
    },
  ),
);
