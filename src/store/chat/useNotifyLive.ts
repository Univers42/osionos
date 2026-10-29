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
import { useToastStore } from '@osionos/ui/primitives/useToastStore';
import { fetchInbox, fetchNotifications, notificationSentence, type NotificationType } from '@/shared/chat/notifyApi';
import { useNotificationsStore } from './useNotificationsStore';
import { usePageStore } from '@/store/usePageStore';
import { useShareTarget } from '@/features/share/useShareTarget';
import { openOrDenyPage } from '@/features/page-link/openOrDenyPage';

// The two page_access_* types never reach this map: they toast their own title.
const VERB: Record<Exclude<NotificationType, 'page_access_request' | 'page_access_decision'>, string> = {
  mention: 'mentioned you',
  dm: 'messaged you',
  reply: 'replied to you',
  reaction: 'reacted to your message',
  connection: 'wants to connect',
  system: '',
  feed_reaction: 'reacted to your post',
  feed_comment: 'commented on your post',
  feed_share: 'shared your post',
  page_comment: 'commented on your page',
  task_due: '',
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
          const open = () => {
            if (type === 'page_access_request') {
              const pageId = payload.channelId ?? null;
              if (!pageId) return;
              const page = usePageStore.getState().pageById(pageId);
              // R3: only open when the owner's store has the page; never deny for the owner.
              if (!page) return;
              usePageStore.getState().openPage({ id: page._id, workspaceId: page.workspaceId, kind: page.databaseId ? 'database' : 'page', title: page.title, icon: page.icon });
              useShareTarget.getState().open({ workspaceId: page.workspaceId, resourceId: pageId, resourceType: 'page' });
            } else if (type === 'page_access_decision') {
              const pageId = payload.channelId ?? null;
              if (!pageId) return;
              const index = usePageStore.getState().pagesIndex[pageId];
              const rawPage = index ? usePageStore.getState().pages[index.workspaceId]?.[index.index] : undefined;
              openOrDenyPage(pageId, rawPage?.workspaceId ?? null, { fetchOnDeny: true });
            }
          };

          if (type === 'page_access_request') {
            useToastStore.getState().push({
              kind: 'info',
              title: 'Access request',
              description: payload.preview ?? '',
              action: { label: 'Open', onClick: open },
            });
          } else if (type === 'page_access_decision') {
            useToastStore.getState().push({
              kind: 'info',
              title: notificationSentence({ type, preview: payload.preview ?? null, channelId: payload.channelId ?? null }),
              action: { label: 'Open', onClick: open },
            });
          } else {
            // A due task has no actor: its preview is the whole message.
            const title = type === 'task_due' ? 'Task due' : `${payload.actorName ?? 'Someone'} ${VERB[type]}`.trim();
            useToastStore.getState().push({
              kind: 'info',
              title,
              description: payload.preview ?? '',
            });
          }
        });
      })
      .catch(() => undefined);
    return () => { alive = false; if (dispose) dispose(); };
  }, []);
}
