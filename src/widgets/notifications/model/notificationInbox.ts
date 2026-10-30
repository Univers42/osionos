/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   notificationInbox.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The inbox's writes (#174). Each lands in the store first and is sent after; one the
 * bridge refuses says why and reloads the list from the bridge, which is the truth.
 */

import { useToastStore } from '@osionos/ui/primitives/useToastStore';
import {
  clearNotifications, deleteNotification, fetchInbox, fetchNotifications, markAllNotificationsRead, markNotificationsRead,
} from '@/shared/chat/notifyApi';
import { useNotificationsStore } from '@/store/chat/useNotificationsStore';

/** Reads the list and the unread total; the panel calls it on open, as the app-level seed may predate the session. */
export async function reloadNotificationInbox(): Promise<void> {
  const [inbox, items] = await Promise.all([fetchInbox(), fetchNotifications()]);
  useNotificationsStore.getState().setItems(items);
  useNotificationsStore.getState().setUnread(inbox.unread);
}

async function send(write: () => Promise<void>, failure: string): Promise<void> {
  try {
    await write();
  } catch (error) {
    useToastStore.getState().push({ kind: 'error', title: failure, description: error instanceof Error ? error.message : undefined });
    await reloadNotificationInbox().catch(() => undefined);
  }
}

const store = () => useNotificationsStore.getState();

export function markNotificationRead(id: string): Promise<void> {
  store().markRead([id]);
  return send(() => markNotificationsRead([id]), 'The notification could not be marked read.');
}

export function markEveryNotificationRead(): Promise<void> {
  store().markAllRead();
  return send(markAllNotificationsRead, 'The notifications could not be marked read.');
}

export function removeNotification(id: string): Promise<void> {
  store().remove([id]);
  return send(() => deleteNotification(id), 'The notification could not be deleted.');
}

export function clearNotificationInbox(): Promise<void> {
  store().clear();
  return send(clearNotifications, 'The notifications could not be cleared.');
}
