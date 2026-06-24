/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useChannelInfo.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Resolve one channel's bridge metadata (kind, name, workspace) from the
 * channel list — the bridge has no single-channel GET. Null while loading,
 * when offline, or when the channel is not visible to the user; the header
 * then simply renders without kind-specific affordances (e.g. Join call).
 */

import { useEffect, useState } from 'react';

import { chatBridgeAvailable, fetchChannels, type ChatChannel } from '@/shared/chat/channelApi';

export function useChannelInfo(channelId: string): ChatChannel | null {
  const [channel, setChannel] = useState<ChatChannel | null>(null);

  useEffect(() => {
    if (!channelId || !chatBridgeAvailable()) return;
    let alive = true;
    fetchChannels()
      .then((all) => {
        if (alive) setChannel(all.find((candidate) => candidate.id === channelId) ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [channelId]);

  return channel;
}
