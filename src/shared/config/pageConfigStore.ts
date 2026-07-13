/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageConfigStore.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:24:31 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/13 19:18:51 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import type { Block } from '@/entities/block';

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
  content: Block[];
  createdAt: string;
  label: string;
}

export interface PageTranslation {
  id: string;
  userId: string;
  pageId: string;
  locale: string;
  label: string;
  title: string;
  content: Block[];
  createdAt: string;
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
  rawMode: boolean;
  showLineNumbers: boolean;
  notifications: {
    comments: boolean;
  };
  connections: PageConnection[];
  analytics: PageAnalytics;
  versions: PageVersion[];
  translations: PageTranslation[];
  activeTranslation?: {
    id: string;
    locale: string;
    label: string;
  };
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
  rawMode: false,
  showLineNumbers: false,
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
  translations: [],
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
    fontSizeScale: config.smallText ? 0.8 : 1,
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
    translations: updates.translations ?? config?.translations ?? DEFAULT_PAGE_CONFIG.translations,
    activeTranslation: updates.activeTranslation ?? config?.activeTranslation,
  };

  return {
    ...next,
    cssTokens: buildCssTokens(next),
  };
}

export function pageConfigKey(userId: string, pageId: string): string {
  return `${userId}:${pageId}`;
}

/** The bridge rejects oversized page bodies with a 413 (which would fail the
 *  WHOLE config PATCH, dropping the lightweight settings too). Version and
 *  translation block snapshots are the heavy, disposable part — when the
 *  serialized config would trip that limit, shed them progressively (version
 *  content → non-active translation content → all translation content) so the
 *  settings still sync. localStorage already does the same for quota
 *  (capVersionsInPersistedValue); the in-memory copy keeps full snapshots. */
const API_CONFIG_SOFT_LIMIT_BYTES = 5_000_000;

function byteSize(value: string): number {
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(value).length : value.length;
}

function shrinkConfigForApi(config: PageConfig): PageConfig {
  let next = config;
  const fits = () => byteSize(JSON.stringify(next)) <= API_CONFIG_SOFT_LIMIT_BYTES;
  if (fits()) return next;
  next = { ...next, versions: next.versions.map((version) => ({ ...version, content: [] })) };
  if (fits()) return next;
  const activeId = next.activeTranslation?.id;
  next = { ...next, translations: next.translations.map((t) => (t.id === activeId ? t : { ...t, content: [] })) };
  if (fits()) return next;
  next = { ...next, translations: next.translations.map((t) => ({ ...t, content: [] })) };
  return next;
}

async function persistPageConfigToApi(pageId: string, config: PageConfig) {
  const state = useUserStore.getState();
  const jwt = state.activePageJwt() || state.activeJwt();
  if (!jwt) return;

  try {
    await api.patch(`/api/pages/${pageId}/config`, { config: shrinkConfigForApi(config) }, jwt);
  } catch {
    // Offline mode keeps the persisted Zustand copy. The API endpoint can sync later.
  }
}

const MAX_PERSISTED_VERSIONS = 10;

/** Returns the persisted blob with each page's version snapshots capped to
 *  `perPageLimit`, used to shed weight when localStorage is over quota. */
function capVersionsInPersistedValue(value: string, perPageLimit: number): string {
  const parsed = JSON.parse(value);
  const configs = parsed?.state?.configs as Record<string, { versions?: unknown[] }> | undefined;
  if (configs) {
    for (const key of Object.keys(configs)) {
      const config = configs[key];
      if (config && Array.isArray(config.versions)) config.versions = config.versions.slice(0, perPageLimit);
    }
  }
  return JSON.stringify(parsed);
}

/**
 * localStorage that never throws on quota: page-version snapshots are the heavy,
 * disposable part, so on failure we progressively drop them (10 → 3 → 1 → 0) and
 * retry. The page config itself (settings) is always preserved.
 */
const quotaSafeStorage: StateStorage = {
  getItem: (name) => globalThis.localStorage?.getItem(name) ?? null,
  removeItem: (name) => globalThis.localStorage?.removeItem(name),
  setItem: (name, value) => {
    const store = globalThis.localStorage;
    if (!store) return;
    // Lazy fallbacks: capVersionsInPersistedValue is a full JSON.parse+stringify of
    // the whole config blob (multi-MB with version/translation snapshots). Building
    // all three candidates EAGERLY made every successful write — the ~1.8s version
    // autosave while typing — pay 3 extra full serializations for nothing. Now the
    // happy path costs one setItem; capped candidates exist only after a quota throw.
    for (const limit of [null, 3, 1, 0] as const) {
      try {
        store.setItem(name, limit === null ? value : capVersionsInPersistedValue(value, limit));
        return;
      } catch {
        // over quota — fall through to a leaner candidate
      }
    }
  },
};

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
          versions: [nextVersion, ...current.versions].slice(0, MAX_PERSISTED_VERSIONS),
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
      storage: createJSONStorage(() => quotaSafeStorage),
    },
  ),
);
