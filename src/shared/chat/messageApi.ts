/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   messageApi.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 15:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Bridge chat message endpoints (scripts/bridge-chat.mjs contract). */

import { api, getActivePageJwt } from '@/shared/api/client';

export interface ChatReaction {
  userId: string;
  emoji: string;
}

export interface Attachment {
  id?: string;
  type: 'image' | 'video' | 'audio' | 'file' | 'url';
  url?: string;
  objectKey?: string;
  bucket?: string;
  sha256?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  metadata?: {
    width?: number;
    height?: number;
    durationMs?: number;
    waveform?: number[];
    title?: string;
    description?: string;
    image?: string;
  };
}

export interface ReplyQuote {
  id: string;
  authorName: string;
  content: string;
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
  attachments?: Attachment[];
  mentions?: string[];
  threadRootId?: string | null;
  replyCount?: number;
  replyTo?: ReplyQuote | null;
}

export interface ChatHistory {
  channelId: string;
  workspaceId: string;
  messages: ChatMessage[];
}

/**
 * The author's answer to L0's warning (C85): "post it anyway".
 *
 * The bridge asks BEFORE it writes a message whose words may hurt someone:
 * in mode hold/on it answers 409 `moderation_warning` and writes NOTHING until
 * the client resends with `acknowledgeWarning: true`. The flag is sent ONLY
 * when the author answered — a client that always sends it publishes every
 * message, warning or not. A DM is never asked (C94).
 */
export interface WriteOptions {
  acknowledgeWarning?: boolean;
}

export async function fetchMessages(channelId: string, before?: string, limit = 50): Promise<ChatHistory> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  return api.get<ChatHistory>(
    `/api/chat/channels/${encodeURIComponent(channelId)}/messages?${params}`,
    getActivePageJwt() ?? undefined,
  );
}

export async function sendMessage(
  channelId: string,
  content: string,
  attachments?: Attachment[],
  replyTo?: string,
  options?: WriteOptions,
): Promise<ChatMessage> {
  const body = options?.acknowledgeWarning
    ? { content, attachments, replyTo, acknowledgeWarning: true }
    : { content, attachments, replyTo };
  const reply = await api.post<{ message: ChatMessage }>(
    `/api/chat/channels/${encodeURIComponent(channelId)}/messages`,
    body,
    getActivePageJwt() ?? undefined,
  );
  return reply.message;
}

/** The root message + all its replies (flat thread). */
export async function fetchThread(rootId: string): Promise<ChatMessage[]> {
  const res = await api.get<{ messages?: ChatMessage[] }>(
    `/api/chat/threads/${encodeURIComponent(rootId)}`,
    getActivePageJwt() ?? undefined,
  );
  return Array.isArray(res.messages) ? res.messages : [];
}

export async function editMessage(
  messageId: string,
  content: string,
  options?: WriteOptions,
): Promise<ChatMessage> {
  const body = options?.acknowledgeWarning ? { content, acknowledgeWarning: true } : { content };
  const reply = await api.patch<{ message: ChatMessage }>(
    `/api/chat/messages/${encodeURIComponent(messageId)}`,
    body,
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
