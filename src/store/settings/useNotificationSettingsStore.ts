/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useNotificationSettingsStore.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { defaultNotifications } from './defaults';
import { errorMessage, nowIso, pushSettingsError, scheduleSettingsWrite, trySettingsDelete, trySettingsGet, trySettingsPatch, trySettingsPut } from './settingsStoreUtils';
import type { NotificationSettings, PageNotificationOverride } from './types';

interface NotificationSettingsStore {
  data: NotificationSettings | null;
  loading: boolean;
  error: string | null;
  hydrate: (userId: string) => Promise<void>;
  update: (patch: Partial<NotificationSettings>) => void;
  updatePageOverride: (pageId: string, patch: Omit<PageNotificationOverride, 'pageId'>) => Promise<void>;
  deletePageOverride: (pageId: string) => Promise<void>;
  reset: (userId: string) => void;
}

const STORE_NAME = 'osionos:settings:notifications';

export const useNotificationSettingsStore = create<NotificationSettingsStore>()(
  persist(
    (set, get) => ({
      data: null,
      loading: false,
      error: null,
      hydrate: async (userId) => {
        if (!userId) return;
        set({ loading: true, error: null });
        try {
          const remote = await trySettingsGet<NotificationSettings>('/api/notifications');
          set({ data: remote ?? get().data ?? defaultNotifications(userId), loading: false, error: null });
        } catch (error) {
          set({ data: get().data ?? defaultNotifications(userId), loading: false, error: errorMessage(error) });
          pushSettingsError('Notifications unavailable', error);
        }
      },
      update: (patch) => {
        const previous = get().data;
        if (!previous) return;
        const next = { ...previous, ...patch, updatedAt: nowIso() };
        set({ data: next, error: null });
        scheduleSettingsWrite(`${STORE_NAME}:${previous.userId}`, async () => {
          try {
            const remote = await trySettingsPatch<NotificationSettings>('/api/notifications', patch);
            if (remote) set({ data: remote, error: null });
          } catch (error) {
            set({ data: previous, error: errorMessage(error) });
            pushSettingsError('Could not save notification settings', error);
          }
        });
      },
      updatePageOverride: async (pageId, patch) => {
        const previous = get().data;
        if (!previous) return;
        const override = { pageId, ...patch };
        const nextOverrides = previous.perPageOverrides.some((item) => item.pageId === pageId)
          ? previous.perPageOverrides.map((item) => item.pageId === pageId ? { ...item, ...override } : item)
          : [...previous.perPageOverrides, override];
        set({ data: { ...previous, perPageOverrides: nextOverrides, updatedAt: nowIso() }, error: null });
        try {
          const remote = await trySettingsPut<PageNotificationOverride>(`/api/notifications/pages/${encodeURIComponent(pageId)}`, patch);
          if (remote) {
            const current = get().data;
            if (current) {
              set({
                data: {
                  ...current,
                  perPageOverrides: current.perPageOverrides.map((item) => item.pageId === pageId ? remote : item),
                },
              });
            }
          }
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not save page notification override', error);
        }
      },
      deletePageOverride: async (pageId) => {
        const previous = get().data;
        if (!previous) return;
        set({ data: { ...previous, perPageOverrides: previous.perPageOverrides.filter((item) => item.pageId !== pageId), updatedAt: nowIso() }, error: null });
        try {
          await trySettingsDelete<void>(`/api/notifications/pages/${encodeURIComponent(pageId)}`);
        } catch (error) {
          set({ data: previous, error: errorMessage(error) });
          pushSettingsError('Could not remove page notification override', error);
        }
      },
      reset: (userId) => set({ data: defaultNotifications(userId || 'anonymous'), error: null }),
    }),
    {
      name: STORE_NAME,
      partialize: (state) => ({ data: state.data }),
    },
  ),
);
