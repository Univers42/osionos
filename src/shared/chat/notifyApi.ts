/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   notifyApi.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Notification inbox endpoints (bridge-notify.mjs contract). */

import { api, getActivePageJwt } from '@/shared/api/client';

export type NotificationType =
  | 'mention' | 'dm' | 'reply' | 'reaction' | 'connection' | 'system'
  | 'feed_reaction' | 'feed_comment' | 'feed_share';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  actorId: string | null;
  channelId: string | null;
  messageId: string | null;
  preview: string | null;
  readAt: string | null;
  createdAt: string;
}

export async function fetchNotifications(limit = 30): Promise<NotificationItem[]> {
  const jwt = getActivePageJwt();
  if (!jwt) return []; // no session yet/anymore — don't fire an unauthenticated 401
  const res = await api.get<{ items?: NotificationItem[] }>(`/api/notifications?limit=${limit}`, jwt);
  return Array.isArray(res.items) ? res.items : [];
}

/** Bootstrap: the per-user realtime topic token + current unread count. */
export async function fetchInbox(): Promise<{ notifyToken: string | null; unread: number }> {
  const jwt = getActivePageJwt();
  if (!jwt) return { notifyToken: null, unread: 0 }; // no session — skip the 401
  const res = await api.get<{ notifyToken?: string | null; unread?: number }>('/api/notifications/inbox', jwt);
  return { notifyToken: res.notifyToken ?? null, unread: res.unread ?? 0 };
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/api/notifications/read-all', {}, getActivePageJwt() ?? undefined);
}
