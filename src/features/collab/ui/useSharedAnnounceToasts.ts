/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useSharedAnnounceToasts.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 19:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 19:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Surfaces inbound durable announces (a teammate seeded a file / left a note)
 * as a brief toast (AOC §4/§6). It watches the collab store's announce feed and
 * toasts only the NEW tail since the last render, looking the actor's name up
 * from the roster. Self-announces are already excluded by the store.
 */

import { useEffect, useRef } from 'react';

import { useToastStore } from '@/shared/ui/primitives/useToastStore';
import { useCollabStore } from '../store/useCollabStore';

export function useSharedAnnounceToasts(active: boolean): void {
  const feed = useCollabStore((state) => state.feed);
  const members = useCollabStore((state) => state.members);
  const seen = useRef(0);

  useEffect(() => {
    if (!active) { seen.current = feed.length; return; }
    for (let i = seen.current; i < feed.length; i += 1) {
      const event = feed[i];
      const name = members.find((m) => m.memberId === event.actor)?.displayName ?? 'A teammate';
      if (event.t === 'file' && event.op === 'seeded') {
        useToastStore.getState().push({ kind: 'info', title: `${name} shared a file`, description: event.name, durationMs: 5000 });
      } else if (event.t === 'note' && event.op === 'created') {
        useToastStore.getState().push({ kind: 'info', title: `${name} left a note`, durationMs: 5000 });
      }
    }
    seen.current = feed.length;
  }, [active, feed, members]);
}
