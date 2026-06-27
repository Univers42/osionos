/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useMessageSearch.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Debounced message search; `channelId` scopes to one channel, else all mine. */

import { useEffect, useState } from 'react';

import { searchMessages, type MessageHit } from '@/shared/chat/searchApi';

export function useMessageSearch(query: string, channelId?: string) {
  const [hits, setHits] = useState<MessageHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); setLoading(false); return; }
    let alive = true;
    const timer = setTimeout(() => {
      setLoading(true);
      searchMessages(q, channelId)
        .then((found) => { if (alive) setHits(found); })
        .catch(() => { if (alive) setHits([]); })
        .finally(() => { if (alive) setLoading(false); });
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, channelId]);

  return { hits, loading };
}
