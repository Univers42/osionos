/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   unreadApi.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Unread counts + read-mark endpoints (bridge-chat.mjs contract). */

import { api, getActivePageJwt } from '@/shared/api/client';

/** Per-channel unread counts for the current user ({ channelId: n }).
 *  No session token yet (first render, before the bridge session hydrates) → no request:
 *  an unauthenticated call can only 401, which is what the console showed on every load. */
export async function fetchUnreadCounts(): Promise<Record<string, number>> {
  const jwt = getActivePageJwt();
  if (!jwt) return {};
  const res = await api.get<{ counts?: Record<string, number> }>('/api/chat/unread', jwt);
  return res.counts ?? {};
}

/** Advance the server-side read mark so the badge clears across devices. */
export async function postChannelRead(channelId: string, upToMessageId?: string): Promise<void> {
  await api.post(
    `/api/chat/channels/${encodeURIComponent(channelId)}/read`,
    upToMessageId ? { upToMessageId } : {},
    getActivePageJwt() ?? undefined,
  );
}
