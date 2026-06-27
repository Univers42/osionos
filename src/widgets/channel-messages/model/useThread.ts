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
 * One thread's messages (root + replies), fetched once then kept live off the
 * channel realtime topic — only `message_created` frames whose threadRootId
 * matches this root are appended (replies also appear inline in the timeline).
 */

import { useEffect, useState } from 'react';

import { chatTopic } from '@/services/realtime-messages/wsTopics';
import { subscribeTopic } from '@/services/realtime-messages/wsTransport';
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

export function useThread(rootId: string, channelId: string, workspaceId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchThread(rootId)
      .then((found) => { if (alive) setMessages(found); })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    if (!workspaceId) return () => { alive = false; };
    const dispose = subscribeTopic(chatTopic(workspaceId, channelId), (frame) => {
      if (frame.event_type !== 'message_created') return;
      const payload = (frame.payload ?? {}) as ThreadFrame;
      if (payload.threadRootId !== rootId || !payload.messageId) return;
      setMessages((prev) => prev.some((m) => m.id === payload.messageId) ? prev : [...prev, {
        id: payload.messageId as string,
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
      }]);
    });
    return () => { alive = false; dispose(); };
  }, [rootId, channelId, workspaceId]);

  return { messages, loading };
}
