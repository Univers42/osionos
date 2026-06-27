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
 * `unread` count is exposed for badges (e.g. the activity rail). This is a
 * GENERAL chat-notification store, separate from the connection-requests panel.
 */

import { create } from 'zustand';

import type { NotificationItem } from '@/shared/chat/notifyApi';

interface NotificationsStore {
  items: NotificationItem[];
  unread: number;
  setItems: (items: NotificationItem[]) => void;
  setUnread: (unread: number) => void;
  prepend: (item: NotificationItem) => void;
  markAllRead: () => void;
}

export const useNotificationsStore = create<NotificationsStore>((set, get) => ({
  items: [],
  unread: 0,
  setItems: (items) => set({ items, unread: items.filter((i) => !i.readAt).length }),
  setUnread: (unread) => set({ unread: Math.max(0, unread) }),
  prepend: (item) => set({ items: [item, ...get().items].slice(0, 50), unread: get().unread + 1 }),
  markAllRead: () => set({ items: get().items.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })), unread: 0 }),
}));
