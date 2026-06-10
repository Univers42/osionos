/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   channelApi.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Bridge chat channel endpoints (scripts/bridge-chat.mjs contract). */

import { api, API_BASE, getActivePageJwt } from '@/shared/api/client';

export interface ChatChannel {
  id: string;
  workspaceId: string;
  kind: 'text' | 'dm' | 'voice' | 'video';
  name: string;
  topic: string | null;
  createdBy: string | null;
  isPrivate: boolean;
  memberRole: string | null;
  createdAt: string | null;
}

export function chatBridgeAvailable(): boolean {
  return Boolean(API_BASE && getActivePageJwt());
}

export async function fetchChannels(workspaceId?: string): Promise<ChatChannel[]> {
  const search = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  const reply = await api.get<{ channels: ChatChannel[] }>(`/api/chat/channels${search}`, getActivePageJwt() ?? undefined);
  return Array.isArray(reply.channels) ? reply.channels : [];
}

export async function createChannel(input: {
  workspaceId: string;
  name: string;
  kind?: string;
  topic?: string;
  isPrivate?: boolean;
}): Promise<ChatChannel> {
  const reply = await api.post<{ channel: ChatChannel }>('/api/chat/channels', input, getActivePageJwt() ?? undefined);
  return reply.channel;
}

/** Find-or-create the 1:1 DM channel with `peerUserId`. */
export async function openDm(peerUserId: string, workspaceId?: string): Promise<ChatChannel> {
  const reply = await api.post<{ channel: ChatChannel }>('/api/chat/dm', { peerUserId, workspaceId }, getActivePageJwt() ?? undefined);
  return reply.channel;
}
