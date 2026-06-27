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
import type { Attachment, ChatMessage, ReplyQuote } from '@/shared/chat/messageApi';

type Patch = (updater: (messages: ChatMessage[]) => ChatMessage[]) => void;

interface ChatEventPayload {
  messageId?: string;
  channelId?: string;
  authorId?: string;
  authorName?: string;
  authorAvatar?: string | null;
  content?: string;
  createdAt?: string;
  editedAt?: string | null;
  userId?: string;
  emoji?: string;
  attachments?: Attachment[];
  mentions?: string[];
  threadRootId?: string | null;
  replyCount?: number;
  replyTo?: ReplyQuote | null;
}

export function applyChatEvent(messages: ChatMessage[], frame: LiveRealtimeEventFrame): ChatMessage[] {
  const payload = (frame.payload ?? {}) as ChatEventPayload;
  const id = payload.messageId;
  if (!id) return messages;
  if (frame.event_type === 'message_created') {
    if (messages.some((message) => message.id === id)) return messages;
    // A threaded reply bumps its root's "N replies" badge in place (matches the
    // DB trigger), then appends inline like any message.
    const base = payload.threadRootId
      ? messages.map((m) => (m.id === payload.threadRootId ? { ...m, replyCount: (m.replyCount ?? 0) + 1 } : m))
      : messages;
    return [...base, {
      id,
      channelId: payload.channelId ?? '',
      authorId: payload.authorId ?? '',
      authorName: payload.authorName ?? 'Member',
      authorAvatar: payload.authorAvatar ?? null,
      content: payload.content ?? '',
      createdAt: payload.createdAt ?? new Date().toISOString(),
      reactions: [],
      attachments: payload.attachments ?? [],
      mentions: payload.mentions ?? [],
      threadRootId: payload.threadRootId ?? null,
      replyCount: payload.replyCount ?? 0,
      replyTo: payload.replyTo ?? null,
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
