/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useNotificationsStore.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * In-app notification inbox (mention / dm / reply / reaction). Seeded from the
 * bridge and updated live off the per-user realtime topic (useNotifyLive). The
 * `unread` count is the bridge's total, which counts rows beyond the loaded page,
 * so the per-item ops count it down by what they change instead of recounting.
 */

import { create } from 'zustand';

import type { NotificationItem, NotificationType } from '@/shared/chat/notifyApi';

export interface LiveNotificationPayload {
  id?: string;
  type?: NotificationType;
  channelId?: string | null;
  messageId?: string | null;
  preview?: string | null;
}

/** The inbox entry for a `notification_created` frame; a bridge older than #174 sends no id. */
export function liveNotificationItem(payload: LiveNotificationPayload): NotificationItem {
  return {
    id: payload.id ?? `live-${Date.now()}-${Math.round(performance.now())}`,
    type: payload.type ?? 'system',
    actorId: null,
    channelId: payload.channelId ?? null,
    messageId: payload.messageId ?? null,
    preview: payload.preview ?? null,
    readAt: null,
    createdAt: new Date().toISOString(),
  };
}

interface NotificationsStore {
  items: NotificationItem[];
  unread: number;
  setItems: (items: NotificationItem[]) => void;
  setUnread: (unread: number) => void;
  prepend: (item: NotificationItem) => void;
  markRead: (ids: readonly string[]) => void;
  markAllRead: () => void;
  remove: (ids: readonly string[]) => void;
  clear: () => void;
}

const unreadAmong = (items: NotificationItem[], ids: ReadonlySet<string>) =>
  items.filter((item) => ids.has(item.id) && !item.readAt).length;

export const useNotificationsStore = create<NotificationsStore>((set, get) => ({
  items: [],
  unread: 0,
  setItems: (items) => set({ items, unread: items.filter((i) => !i.readAt).length }),
  setUnread: (unread) => set({ unread: Math.max(0, unread) }),
  prepend: (item) => set({ items: [item, ...get().items].slice(0, 50), unread: get().unread + 1 }),
  markRead: (ids) => {
    const named = new Set(ids);
    const now = new Date().toISOString();
    set({
      items: get().items.map((i) => (named.has(i.id) ? { ...i, readAt: i.readAt ?? now } : i)),
      unread: Math.max(0, get().unread - unreadAmong(get().items, named)),
    });
  },
  markAllRead: () => set({ items: get().items.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })), unread: 0 }),
  remove: (ids) => {
    const named = new Set(ids);
    set({
      items: get().items.filter((i) => !named.has(i.id)),
      unread: Math.max(0, get().unread - unreadAmong(get().items, named)),
    });
  },
  clear: () => set({ items: [], unread: 0 }),
}));
