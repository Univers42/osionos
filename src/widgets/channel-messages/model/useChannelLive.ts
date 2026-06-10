/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useChannelLive.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Live channel events from the realtime gateway on `chat:<ws>:<channel>`,
 * applied as pure patches over the history state (created/updated/deleted +
 * reaction add/remove). The bridge stamps every event server-side after the
 * row is persisted, so what arrives here is already durable.
 */

import { useEffect } from 'react';

import { chatTopic } from '@/services/realtime-messages/wsTopics';
import {
  subscribeTopic,
  type LiveRealtimeEventFrame,
} from '@/services/realtime-messages/wsTransport';
import type { ChatMessage } from '@/shared/chat/messageApi';

type Patch = (updater: (messages: ChatMessage[]) => ChatMessage[]) => void;

interface ChatEventPayload {
  messageId?: string;
  channelId?: string;
  authorId?: string;
  authorName?: string;
  content?: string;
  createdAt?: string;
  editedAt?: string | null;
  userId?: string;
  emoji?: string;
}

export function applyChatEvent(messages: ChatMessage[], frame: LiveRealtimeEventFrame): ChatMessage[] {
  const payload = (frame.payload ?? {}) as ChatEventPayload;
  const id = payload.messageId;
  if (!id) return messages;
  if (frame.event_type === 'message_created') {
    if (messages.some((message) => message.id === id)) return messages;
    return [...messages, {
      id,
      channelId: payload.channelId ?? '',
      authorId: payload.authorId ?? '',
      authorName: payload.authorName ?? 'Member',
      content: payload.content ?? '',
      createdAt: payload.createdAt ?? new Date().toISOString(),
      reactions: [],
    }];
  }
  if (frame.event_type === 'message_updated') {
    return messages.map((message) => message.id === id
      ? { ...message, content: payload.content ?? message.content, editedAt: payload.editedAt ?? new Date().toISOString() }
      : message);
  }
  if (frame.event_type === 'message_deleted') {
    return messages.filter((message) => message.id !== id);
  }
  if (frame.event_type === 'reaction_added' || frame.event_type === 'reaction_removed') {
    const { userId, emoji } = payload;
    if (!userId || !emoji) return messages;
    return messages.map((message) => {
      if (message.id !== id) return message;
      const without = message.reactions.filter((r) => !(r.userId === userId && r.emoji === emoji));
      return {
        ...message,
        reactions: frame.event_type === 'reaction_added' ? [...without, { userId, emoji }] : without,
      };
    });
  }
  return messages;
}

/** Subscribe while mounted; inert when the transport is disabled. */
export function useChannelLive(workspaceId: string, channelId: string, patch: Patch): void {
  useEffect(() => {
    if (!workspaceId || !channelId) return undefined;
    return subscribeTopic(chatTopic(workspaceId, channelId), (frame) => {
      patch((messages) => applyChatEvent(messages, frame));
    });
  }, [workspaceId, channelId, patch]);
}
