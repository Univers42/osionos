/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useChannelHistory.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Channel history from the bridge (`/api/chat/channels/:id/messages`) with a
 * graceful fallback: when the bridge is unreachable (offline/local-only run)
 * the hook degrades to the legacy BroadcastChannel store so the channel view
 * keeps working exactly as before. Feature-detection happens once per mount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  useRealtimeMessagesStore,
  type RealtimeMessage,
} from '@/services/realtime-messages';
import { chatBridgeAvailable } from '@/shared/chat/channelApi';
import { fetchMessages, type ChatMessage } from '@/shared/chat/messageApi';

export type ChannelMode = 'bridge' | 'local';

const EMPTY_LOCAL: RealtimeMessage[] = [];

function localToChat(message: RealtimeMessage): ChatMessage {
  return {
    id: message.id,
    channelId: message.threadId.replace(/^channel:/, ''),
    authorId: message.authorId,
    authorName: message.authorName,
    content: message.body,
    createdAt: message.createdAt,
    reactions: [],
  };
}

export function useChannelHistory(channelId: string) {
  const [serverMessages, setServerMessages] = useState<ChatMessage[]>([]);
  const [mode, setMode] = useState<ChannelMode>('local');
  const [workspaceId, setWorkspaceId] = useState('');
  const [loading, setLoading] = useState(true);
  const aliveRef = useRef(true);
  const localMessages = useRealtimeMessagesStore(
    (s) => s.messagesByThread[`channel:${channelId}`] ?? EMPTY_LOCAL,
  );

  const reload = useCallback(async () => {
    if (!chatBridgeAvailable()) {
      setMode('local');
      setLoading(false);
      return;
    }
    try {
      const history = await fetchMessages(channelId);
      if (!aliveRef.current) return;
      setServerMessages(history.messages);
      setWorkspaceId(history.workspaceId);
      setMode('bridge');
    } catch {
      if (aliveRef.current) setMode('local'); // bridge absent → legacy echo path
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    aliveRef.current = true;
    setLoading(true);
    setServerMessages([]);
    void reload();
    return () => {
      aliveRef.current = false;
    };
  }, [reload]);

  return {
    mode,
    loading,
    workspaceId,
    messages: mode === 'bridge' ? serverMessages : localMessages.map(localToChat),
    setMessages: setServerMessages,
    reload,
  };
}
