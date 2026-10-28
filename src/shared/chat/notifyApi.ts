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
  | 'feed_reaction' | 'feed_comment' | 'feed_share'
  | 'page_comment' | 'task_due'
  | 'page_access_request' | 'page_access_decision';

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

/** Plain-text sentence for a notification, used by the inbox UI and toasts.
 *  A page title is never interpolated into the access-decision sentence, even
 *  when one is supplied, so a decline/approval cannot leak a private title. */
export function notificationSentence(
  notification: { type: NotificationType; preview?: string | null; channelId?: string | null },
): string {
  switch (notification.type) {
    case 'page_access_request':
      return notification.preview ? String(notification.preview) : 'Access requested';
    case 'page_access_decision':
      return notification.preview === 'declined'
        ? 'Your access request was declined'
        : 'Your access request was approved';
    default:
      return notification.preview ?? '';
  }
}
