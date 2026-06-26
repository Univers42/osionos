/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useConversations.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The full-page messaging list model: every DM + group channel I belong to,
 * each with its last-message preview and unread count. DMs come from the
 * dm-list hook (kind === "dm"); groups from fetchChannels filtered to "group".
 * Unread is read live from the persisted unread store. Last-message previews
 * are fetched once per channel (limit 1), best-effort.
 */

import { useEffect, useMemo, useState } from 'react';

import { fetchChannels, type ChatChannel } from '@/shared/chat/channelApi';
import { fetchMessages } from '@/shared/chat/messageApi';
import { useUnreadStore } from '@/store/chat/useUnreadStore';
import { useDmChannels } from '@/widgets/dm-list/useDmChannels';

export interface Conversation {
  channel: ChatChannel;
  preview: string;
  unread: number;
}

const CONVO_KINDS = new Set(['dm', 'group']);

function loadPreviews(channels: ChatChannel[], set: (m: Record<string, string>) => void): void {
  void Promise.all(
    channels.map((channel) =>
      fetchMessages(channel.id, undefined, 1)
        .then((history) => [channel.id, history.messages.at(-1)?.content ?? ''] as const)
        .catch(() => [channel.id, ''] as const),
    ),
  ).then((pairs) => set(Object.fromEntries(pairs)));
}

export function useConversations() {
  const { channels: dms, loading: dmLoading, available, reload } = useDmChannels();
  const [groups, setGroups] = useState<ChatChannel[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const counts = useUnreadStore((s) => s.counts);

  useEffect(() => {
    if (!available) return;
    fetchChannels()
      .then((all) => setGroups(all.filter((c) => CONVO_KINDS.has(c.kind) && c.kind !== 'dm')))
      .catch(() => setGroups([]));
  }, [available]);

  const channels = useMemo(() => [...dms, ...groups], [dms, groups]);

  useEffect(() => {
    if (channels.length) loadPreviews(channels, setPreviews);
  }, [channels]);

  const conversations = useMemo<Conversation[]>(
    () => channels.map((channel) => ({ channel, preview: previews[channel.id] ?? '', unread: counts[channel.id] ?? 0 })),
    [channels, previews, counts],
  );

  return { conversations, loading: dmLoading, available, reload };
}
