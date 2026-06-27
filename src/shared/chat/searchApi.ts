/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   searchApi.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Membership-scoped message search (bridge-chat-search.mjs contract). */

import { api, getActivePageJwt } from '@/shared/api/client';

export interface MessageHit {
  messageId: string;
  channelId: string;
  channelName: string;
  workspaceId: string | null;
  authorName: string;
  snippet: string;
  createdAt: string;
}

/** Search my messages; `channelId` scopes to one channel, else all my channels. */
export async function searchMessages(query: string, channelId?: string, limit = 20): Promise<MessageHit[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (channelId) params.set('channelId', channelId);
  const res = await api.get<{ hits?: MessageHit[] }>(`/api/chat/search?${params.toString()}`, getActivePageJwt() ?? undefined);
  return Array.isArray(res.hits) ? res.hits : [];
}
