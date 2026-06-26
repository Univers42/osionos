/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   groupApi.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Bridge group-channel management endpoints (bridge-chat contract). */

import { api, getActivePageJwt } from '@/shared/api/client';
import type { ChatChannel } from '@/shared/chat/channelApi';

function jwt(): string | undefined {
  return getActivePageJwt() ?? undefined;
}

export async function createGroup(input: {
  name: string;
  memberIds: string[];
  avatar?: string;
  description?: string;
  workspaceId?: string;
}): Promise<ChatChannel> {
  const reply = await api.post<{ channel: ChatChannel }>('/api/chat/groups', input, jwt());
  return reply.channel;
}

export async function renameChannel(id: string, patch: {
  name?: string;
  avatar?: string;
  description?: string;
  topic?: string;
}): Promise<ChatChannel | null> {
  const reply = await api.patch<{ channel?: ChatChannel }>(
    `/api/chat/channels/${encodeURIComponent(id)}`,
    patch,
    jwt(),
  );
  return reply.channel ?? null;
}

export async function addMembers(channelId: string, userIds: string[]): Promise<void> {
  await api.post(`/api/chat/channels/${encodeURIComponent(channelId)}/members`, { userIds }, jwt());
}

export async function removeMember(channelId: string, userId: string): Promise<void> {
  await api.delete(
    `/api/chat/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`,
    jwt(),
  );
}

export async function setMemberRole(channelId: string, userId: string, role: string): Promise<void> {
  await api.patch(
    `/api/chat/channels/${encodeURIComponent(channelId)}/members/${encodeURIComponent(userId)}`,
    { role },
    jwt(),
  );
}
