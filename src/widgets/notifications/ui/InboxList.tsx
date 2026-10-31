/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   InboxList.tsx                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from 'react';
import { Check, X } from 'lucide-react';

import { Button } from '@osionos/ui/atoms/Button';
import { IconButton } from '@osionos/ui/atoms/IconButton';
import { NOTIFICATION_TITLE, notificationSentence, type NotificationItem } from '@/shared/chat/notifyApi';
import { formatRelativeTime } from '@/shared/lib/relativeTime';
import {
  clearNotificationInbox, markEveryNotificationRead, markNotificationRead, removeNotification,
} from '../model/notificationInbox';

const InboxRow: React.FC<{ item: NotificationItem }> = ({ item }) => (
  <li className="group flex items-start gap-2 border-b border-[var(--osio-border-default)] px-3 py-2.5 last:border-b-0">
    <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? '' : 'bg-[var(--osio-accent)]'}`} />
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline gap-2">
        <span className={`truncate text-sm text-[var(--osio-fg-default)] ${item.readAt ? '' : 'font-semibold'}`}>
          {NOTIFICATION_TITLE[item.type] ?? NOTIFICATION_TITLE.system}
        </span>
        {item.readAt ? null : <span className="sr-only">Unread</span>}
        <time dateTime={item.createdAt} className="shrink-0 text-xs text-[var(--osio-fg-subtle)]">
          {formatRelativeTime(item.createdAt)}
        </time>
      </span>
      <span className="block truncate text-xs text-[var(--osio-fg-muted)]">{notificationSentence(item)}</span>
    </span>
    {item.readAt ? null : (
      <IconButton label="Mark as read" size="xs" onClick={() => void markNotificationRead(item.id)}>
        <Check size={14} />
      </IconButton>
    )}
    <IconButton label="Delete notification" size="xs" onClick={() => void removeNotification(item.id)}>
      <X size={14} />
    </IconButton>
  </li>
);

/** The stored notifications, newest first, each readable and deletable on its own.
 *  `unread` is the bridge's total, which also counts rows past the loaded page. */
export const InboxList: React.FC<{ items: NotificationItem[]; unread: number }> = ({ items, unread }) => (
  <section aria-label="Inbox" className="flex flex-col">
    {items.length > 0 ? (
      <>
        <div className="flex items-center justify-end gap-1 px-3 py-1.5">
          <Button
            tone="ghost"
            className="px-2 py-1 text-xs"
            disabled={unread === 0}
            onClick={() => void markEveryNotificationRead()}
          >
            Mark all read
          </Button>
          <Button tone="ghost" className="px-2 py-1 text-xs" onClick={() => void clearNotificationInbox()}>
            Clear all
          </Button>
        </div>
        <ul className="flex flex-col">
          {items.map((item) => <InboxRow key={item.id} item={item} />)}
        </ul>
      </>
    ) : null}
  </section>
);
