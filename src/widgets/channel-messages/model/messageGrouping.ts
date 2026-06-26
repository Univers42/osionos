/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   messageGrouping.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure timeline shaping: walk messages once and decide, per row, whether to
 * print a date divider (day boundary) and whether the row is "grouped" — a
 * consecutive message from the same author within a 5-minute window (Slack/
 * Discord style), so the avatar + name header is hidden. A reply always starts a
 * fresh block. Kept side-effect-free so it's trivially testable.
 */

import type { ChatMessage } from '@/shared/chat/messageApi';

export interface MessageRowEntry {
  message: ChatMessage;
  grouped: boolean;
  divider: string | null;
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(when: Date): string {
  const now = new Date();
  if (sameDay(when, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(when, yesterday)) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(when);
}

/**
 * The unread anchor: the first message newer than `lastReadAt` that the reader
 * did not author (so the "New" divider sits exactly where they left off). Null
 * when the channel was never opened or everything is already read.
 */
export function firstUnreadId(messages: ChatMessage[], lastReadAt: string | null, selfId: string): string | null {
  if (!lastReadAt) return null;
  const since = new Date(lastReadAt).getTime();
  for (const message of messages) {
    if (message.authorId !== selfId && new Date(message.createdAt).getTime() > since) return message.id;
  }
  return null;
}

export function buildMessageRows(messages: ChatMessage[]): MessageRowEntry[] {
  const rows: MessageRowEntry[] = [];
  let prev: ChatMessage | null = null;
  for (const message of messages) {
    const at = new Date(message.createdAt);
    const divider = !prev || !sameDay(new Date(prev.createdAt), at) ? dayLabel(at) : null;
    const grouped = Boolean(
      prev && !divider && prev.authorId === message.authorId &&
      at.getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS &&
      !message.replyTo,
    );
    rows.push({ message, grouped, divider });
    prev = message;
  }
  return rows;
}
