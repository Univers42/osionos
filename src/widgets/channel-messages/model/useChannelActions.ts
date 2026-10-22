/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useChannelActions.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Channel write actions. Bridge mode persists through /api/chat and applies
 * the server's representation locally (the WS event then de-dupes by id);
 * local mode falls back to the legacy BroadcastChannel store (same-tab echo).
 *
 * Every write answers a TYPED outcome (model/channelWrites): a warning from
 * L0 is not a failure — the author is asked first and the message is written
 * only when they say so.
 */

import { useCallback } from 'react';

import { useRealtimeMessagesStore } from '@/services/realtime-messages';
import {
  deleteMessage,
  toggleReaction,
  type Attachment,
  type ChatMessage,
  type WriteOptions,
} from '@/shared/chat/messageApi';
import {
  editChannelMessage,
  sendChannelMessage,
  type SendOutcome,
} from './channelWrites';
import type { ChannelMode } from './useChannelHistory';

export type { SendOutcome };

interface ActionDeps {
  mode: ChannelMode;
  channelId: string;
  userId: string;
  userName: string;
  setMessages: (updater: (messages: ChatMessage[]) => ChatMessage[]) => void;
}

export function useChannelActions({ mode, channelId, userId, userName, setMessages }: ActionDeps) {
  const sendLocal = useRealtimeMessagesStore((s) => s.sendMessage);

  const send = useCallback(async (
    body: string,
    attachments?: Attachment[],
    replyTo?: string,
    options?: WriteOptions,
  ): Promise<SendOutcome> => {
    const content = body.trim();
    if (!content && !(attachments && attachments.length)) return { ok: false };
    // Local mode (no bridge): the legacy store, which is never asked by L0.
    if (mode !== 'bridge') {
      return sendLocal(`channel:${channelId}`, userId, userName, content) ? { ok: true } : { ok: false };
    }
    return sendChannelMessage({ channelId, userId, userName, setMessages }, content, attachments, replyTo, options);
  }, [mode, channelId, userId, userName, sendLocal, setMessages]);

  const edit = useCallback(async (
    messageId: string,
    content: string,
    options?: WriteOptions,
  ): Promise<SendOutcome> => {
    // Local mode never edits: the legacy store has no edit, and nothing was
    // written — the answer says so instead of pretending it worked.
    if (mode !== 'bridge') return { ok: false };
    const trimmed = content.trim();
    if (!trimmed) return { ok: false };
    return editChannelMessage(setMessages, messageId, trimmed, options);
  }, [mode, setMessages]);

  const remove = useCallback(async (messageId: string) => {
    if (mode !== 'bridge') return;
    await deleteMessage(messageId);
    setMessages((messages) => messages.filter((m) => m.id !== messageId));
  }, [mode, setMessages]);

  const react = useCallback(async (messageId: string, emoji: string, add: boolean) => {
    if (mode !== 'bridge') return;
    await toggleReaction(messageId, emoji, add);
    setMessages((messages) => messages.map((m) => {
      if (m.id !== messageId) return m;
      const without = m.reactions.filter((r) => !(r.userId === userId && r.emoji === emoji));
      return { ...m, reactions: add ? [...without, { userId, emoji }] : without };
    }));
  }, [mode, userId, setMessages]);

  return { send, edit, remove, react };
}
