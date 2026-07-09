/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useNotifyLive.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Live notifications: seed the inbox + subscribe the per-user realtime topic
 * (keyed by the unguessable notify_token). Each `notification_created` frame
 * raises a toast and prepends to the notifications store. Mount ONCE near the
 * app root. Best-effort — no bridge/session just leaves it inert.
 */

import { useEffect } from 'react';

import { subscribeTopic } from '@/services/realtime-messages/wsTransport';
import { userTopic } from '@/services/realtime-messages/wsTopics';
import { useToastStore } from '@/shared/ui/primitives/useToastStore';
import { fetchInbox, fetchNotifications, type NotificationType } from '@/shared/chat/notifyApi';
import { useNotificationsStore } from './useNotificationsStore';

const VERB: Record<NotificationType, string> = {
  mention: 'mentioned you',
  dm: 'messaged you',
  reply: 'replied to you',
  reaction: 'reacted to your message',
  connection: 'wants to connect',
  system: '',
  feed_reaction: 'reacted to your post',
  feed_comment: 'commented on your post',
  feed_share: 'shared your post',
};

export function useNotifyLive(): void {
  useEffect(() => {
    let alive = true;
    let dispose: (() => void) | undefined;
    void Promise.all([fetchInbox(), fetchNotifications()])
      .then(([inbox, items]) => {
        if (!alive) return;
        useNotificationsStore.getState().setItems(items);
        useNotificationsStore.getState().setUnread(inbox.unread);
        if (!inbox.notifyToken) return;
        dispose = subscribeTopic(userTopic(inbox.notifyToken), (frame) => {
          if (frame.event_type !== 'notification_created') return;
          const payload = (frame.payload ?? {}) as { type?: NotificationType; actorName?: string; channelId?: string; messageId?: string; preview?: string };
          const type = payload.type ?? 'system';
          const actor = payload.actorName ?? 'Someone';
          useNotificationsStore.getState().prepend({
            id: `live-${Date.now()}-${Math.round(performance.now())}`,
            type,
            actorId: null,
            channelId: payload.channelId ?? null,
            messageId: payload.messageId ?? null,
            preview: payload.preview ?? null,
            readAt: null,
            createdAt: new Date().toISOString(),
          });
          useToastStore.getState().push({ kind: 'info', title: `${actor} ${VERB[type]}`.trim(), description: payload.preview ?? '' });
        });
      })
      .catch(() => undefined);
    return () => { alive = false; if (dispose) dispose(); };
  }, []);
}
