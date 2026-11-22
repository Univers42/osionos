/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useThread.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * One thread's messages (root + replies), fetched on open and again after a
 * reconnect, then kept live off the channel realtime topic — only `message_created`
 * frames whose threadRootId matches this root are appended (replies also appear
 * inline in the timeline).
 */

import { useEffect, useState } from 'react';

import { chatTopic } from '@/services/realtime-messages/wsTopics';
import { subscribeTopic, type LiveRealtimeEventFrame } from '@/services/realtime-messages/wsTransport';
import { fetchThread, type Attachment, type ChatMessage } from '@/shared/chat/messageApi';

interface ThreadFrame {
  messageId?: string;
  threadRootId?: string;
  authorId?: string;
  authorName?: string;
  authorAvatar?: string | null;
  content?: string;
  createdAt?: string;
  attachments?: Attachment[];
  mentions?: string[];
}

/** A `message_created` frame of this thread, appended once; any other frame leaves the list as it is. */
export function applyThreadFrame(messages: ChatMessage[], frame: LiveRealtimeEventFrame, rootId: string, channelId: string): ChatMessage[] {
  if (frame.event_type !== 'message_created') return messages;
  const payload = (frame.payload ?? {}) as ThreadFrame;
  if (payload.threadRootId !== rootId || !payload.messageId) return messages;
  if (messages.some((m) => m.id === payload.messageId)) return messages;
  return [...messages, {
    id: payload.messageId,
    channelId,
    authorId: payload.authorId ?? '',
    authorName: payload.authorName ?? 'Member',
    authorAvatar: payload.authorAvatar ?? null,
    content: payload.content ?? '',
    createdAt: payload.createdAt ?? new Date().toISOString(),
    reactions: [],
    attachments: payload.attachments ?? [],
    mentions: payload.mentions ?? [],
    threadRootId: rootId,
    replyTo: null,
  }];
}

export function useThread(rootId: string, channelId: string, workspaceId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset loading before the refetch triggered by a thread (rootId/channel/workspace) change (osionos#341)
    setLoading(true);
    const read = () => fetchThread(rootId).then((found) => { if (alive) setMessages(found); });
    read()
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    if (!workspaceId) return () => { alive = false; };
    // After a reconnect the thread is read again: the gateway does not replay the gap (#172).
    const catchUp = () => {
      read().catch((error: unknown) => console.warn('[chat] catching up a thread after a reconnect failed:', error));
    };
    const dispose = subscribeTopic(chatTopic(workspaceId, channelId), (frame) => {
      setMessages((prev) => applyThreadFrame(prev, frame, rootId, channelId));
    }, catchUp);
    return () => { alive = false; dispose(); };
  }, [rootId, channelId, workspaceId]);

  return { messages, loading };
}
