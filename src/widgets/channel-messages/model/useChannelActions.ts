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

  const send = useCallback(async (body: string) => {
    const content = body.trim();
    if (!content) return false;
    if (mode !== 'bridge') return Boolean(sendLocal(`channel:${channelId}`, userId, userName, content));
    const message = await sendMessage(channelId, content);
    setMessages((messages) => messages.some((m) => m.id === message.id) ? messages : [...messages, message]);
    return true;
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
