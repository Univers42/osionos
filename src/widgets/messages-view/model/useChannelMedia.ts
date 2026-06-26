/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useChannelMedia.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Contact-info media model: GET /api/chat/channels/:id/media (all types) via
 * fetchChannelMedia, grouped for the "Media, links & docs" gallery. media =
 * image/video; links = url-type attachments; docs = audio/file. Best-effort —
 * an unreachable bridge yields an empty grouping, not a thrown error.
 */

import { useEffect, useMemo, useState } from 'react';

import { fetchChannelMedia } from '@/shared/chat/attachmentApi';
import type { Attachment } from '@/shared/chat/messageApi';

export interface ChannelMediaGroups {
  media: Attachment[];
  links: Attachment[];
  docs: Attachment[];
}

function group(items: Attachment[]): ChannelMediaGroups {
  const media: Attachment[] = [];
  const links: Attachment[] = [];
  const docs: Attachment[] = [];
  for (const item of items) {
    if (item.type === 'image' || item.type === 'video') media.push(item);
    else if (item.type === 'url') links.push(item);
    else docs.push(item);
  }
  return { media, links, docs };
}

interface LoadState {
  channelId: string | null;
  items: Attachment[];
  loading: boolean;
}

export function useChannelMedia(channelId: string | null) {
  // One state object set only from the async resolution (never synchronously in
  // the effect body/cleanup) — `loaded.channelId` gates stale data from a prior id.
  const [loaded, setLoaded] = useState<LoadState>({ channelId: null, items: [], loading: false });

  useEffect(() => {
    if (!channelId) return;
    let alive = true;
    fetchChannelMedia(channelId)
      .then((media) => { if (alive) setLoaded({ channelId, items: media, loading: false }); })
      .catch(() => { if (alive) setLoaded({ channelId, items: [], loading: false }); });
    return () => { alive = false; };
  }, [channelId]);

  const fresh = loaded.channelId === channelId;
  const groups = useMemo(() => group(fresh ? loaded.items : []), [fresh, loaded.items]);
  const loading = Boolean(channelId) && !fresh;
  return { groups, loading };
}
