/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDmChannels.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** My DM channels from the bridge (GET /api/chat/channels, kind === "dm"). */

import { useCallback, useEffect, useState } from 'react';

import { chatBridgeAvailable, fetchChannels, type ChatChannel } from '@/shared/chat/channelApi';

export function useDmChannels() {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);

  const reload = useCallback(() => {
    if (!chatBridgeAvailable()) {
      setAvailable(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchChannels()
      .then((all) => {
        setChannels(all.filter((channel) => channel.kind === 'dm'));
        setAvailable(true);
      })
      .catch(() => setAvailable(false))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Deferred so the effect body itself stays setState-free (react-hooks rule).
    const timer = setTimeout(reload, 0);
    return () => clearTimeout(timer);
  }, [reload]);

  return { channels, loading, available, reload };
}
