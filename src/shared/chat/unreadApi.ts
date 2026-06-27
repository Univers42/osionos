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

/** Per-channel unread counts for the current user ({ channelId: n }). */
export async function fetchUnreadCounts(): Promise<Record<string, number>> {
  const res = await api.get<{ counts?: Record<string, number> }>('/api/chat/unread', getActivePageJwt() ?? undefined);
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
