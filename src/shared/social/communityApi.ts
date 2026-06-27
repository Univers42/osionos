/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   communityApi.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Bridge community endpoints (bridge-chat contract). */

import { api, getActivePageJwt } from '@/shared/api/client';
import type { ChatChannel } from '@/shared/chat/channelApi';

export interface Community {
  id: string;
  name: string;
  description: string | null;
  avatar: string | null;
  createdBy: string | null;
  createdAt: string | null;
  memberRole?: string | null;
  /** Populated by getCommunity: the channels the bridge groups under this community. */
  channels?: ChatChannel[];
}

function jwt(): string | undefined {
  return getActivePageJwt() ?? undefined;
}

export async function createCommunity(input: {
  name: string;
  description?: string;
  avatar?: string;
}): Promise<Community> {
  const reply = await api.post<{ community: Community }>('/api/communities', input, jwt());
  return reply.community;
}

export async function listCommunities(): Promise<Community[]> {
  const reply = await api.get<{ communities: Community[] }>('/api/communities', jwt());
  return Array.isArray(reply.communities) ? reply.communities : [];
}

export async function getCommunity(id: string): Promise<Community> {
  // The bridge returns { community, channels } with channels as a TOP-LEVEL sibling
  // (not nested) — attach it so the panel can list them.
  const reply = await api.get<{ community: Community; channels: ChatChannel[] }>(
    `/api/communities/${encodeURIComponent(id)}`,
    jwt(),
  );
  return { ...reply.community, channels: Array.isArray(reply.channels) ? reply.channels : [] };
}

export async function addCommunityChannel(
  id: string,
  channelId: string,
): Promise<{ communityId: string; channelId: string }> {
  return api.post<{ communityId: string; channelId: string }>(
    `/api/communities/${encodeURIComponent(id)}/channels`,
    { channelId },
    jwt(),
  );
}

export async function joinCommunity(id: string): Promise<boolean> {
  const reply = await api.post<{ joined?: boolean }>(
    `/api/communities/${encodeURIComponent(id)}/join`,
    {},
    jwt(),
  );
  return Boolean(reply.joined);
}
