/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useChannelActions.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Channel write actions. Bridge mode persists through /api/chat and applies
 * the server's representation locally (the WS event then de-dupes by id);
 * local mode falls back to the legacy BroadcastChannel store (same-tab echo).
 */

import { useCallback } from 'react';

import { useRealtimeMessagesStore } from '@/services/realtime-messages';
import {
  deleteMessage,
  editMessage,
  sendMessage,
  toggleReaction,
  type Attachment,
  type ChatMessage,
} from '@/shared/chat/messageApi';
import type { ChannelMode } from './useChannelHistory';

interface ActionDeps {
  mode: ChannelMode;
  channelId: string;
  userId: string;
  userName: string;
  setMessages: (updater: (messages: ChatMessage[]) => ChatMessage[]) => void;
}

export function useChannelActions({ mode, channelId, userId, userName, setMessages }: ActionDeps) {
  const sendLocal = useRealtimeMessagesStore((s) => s.sendMessage);

  const send = useCallback(async (body: string, attachments?: Attachment[], replyTo?: string) => {
    const content = body.trim();
    if (!content && !(attachments && attachments.length)) return false;
    if (mode !== 'bridge') return Boolean(sendLocal(`channel:${channelId}`, userId, userName, content));
    // Optimistic: show the message instantly under a temp id, then reconcile with
    // the server row on await (the WS echo de-dupes by id, so a double never
    // sticks); roll the temp back on failure. Removes the round-trip from the
    // sender's perceived latency.
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: ChatMessage = {
      id: tempId, channelId, authorId: userId, authorName: userName, authorAvatar: null,
      content, createdAt: new Date().toISOString(), reactions: [],
      attachments: attachments ?? [], mentions: [], threadRootId: null, replyCount: 0, replyTo: null,
    };
    setMessages((messages) => [...messages, optimistic]);
    try {
      const message = await sendMessage(channelId, content, attachments, replyTo);
      setMessages((messages) => {
        const withoutTemp = messages.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === message.id) ? withoutTemp : [...withoutTemp, message];
      });
      return true;
    } catch {
      setMessages((messages) => messages.filter((m) => m.id !== tempId)); // send failed → drop the temp
      return false;
    }
  }, [mode, channelId, userId, userName, sendLocal, setMessages]);

  const edit = useCallback(async (messageId: string, content: string) => {
    if (mode !== 'bridge' || !content.trim()) return;
    const updated = await editMessage(messageId, content.trim());
    setMessages((messages) => messages.map((m) => (m.id === messageId ? { ...m, ...updated } : m)));
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
