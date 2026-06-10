/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   messageApi.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Bridge chat message endpoints (scripts/bridge-chat.mjs contract). */

import { api, getActivePageJwt } from '@/shared/api/client';

export interface ChatReaction {
  userId: string;
  emoji: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  reactions: ChatReaction[];
}

export interface ChatHistory {
  channelId: string;
  workspaceId: string;
  messages: ChatMessage[];
}

export async function fetchMessages(channelId: string, before?: string, limit = 50): Promise<ChatHistory> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  return api.get<ChatHistory>(
    `/api/chat/channels/${encodeURIComponent(channelId)}/messages?${params}`,
    getActivePageJwt() ?? undefined,
  );
}

export async function sendMessage(channelId: string, content: string): Promise<ChatMessage> {
  const reply = await api.post<{ message: ChatMessage }>(
    `/api/chat/channels/${encodeURIComponent(channelId)}/messages`,
    { content },
    getActivePageJwt() ?? undefined,
  );
  return reply.message;
}

export async function editMessage(messageId: string, content: string): Promise<ChatMessage> {
  const reply = await api.patch<{ message: ChatMessage }>(
    `/api/chat/messages/${encodeURIComponent(messageId)}`,
    { content },
    getActivePageJwt() ?? undefined,
  );
  return reply.message;
}

export async function deleteMessage(messageId: string): Promise<void> {
  await api.delete(`/api/chat/messages/${encodeURIComponent(messageId)}`, getActivePageJwt() ?? undefined);
}

export async function toggleReaction(messageId: string, emoji: string, add: boolean): Promise<void> {
  const path = `/api/chat/messages/${encodeURIComponent(messageId)}/reactions`;
  if (add) await api.post(path, { emoji }, getActivePageJwt() ?? undefined);
  else await api.delete(`${path}?emoji=${encodeURIComponent(emoji)}`, getActivePageJwt() ?? undefined);
}
