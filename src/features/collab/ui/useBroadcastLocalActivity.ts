/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useBroadcastLocalActivity.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 18:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 18:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Broadcasts THIS client's non-text awareness (AOC §4): a `nav` event when the
 * open page changes (drives cross-page presence + clears this client's caret on
 * peers) and `focus`/blur events for controls that opt in via
 * `data-collab-control`. All share the store's single monotone `nextSeq()` with
 * the caret stream, so a remote reducer orders the whole ephemeral stream
 * correctly. Low-frequency + event-driven — no rAF needed here.
 */

import { useEffect } from 'react';

import { useCollabStore } from '../store/useCollabStore';

function controlIdOf(target: EventTarget | null): string | null {
  const el = target instanceof Element ? target.closest<HTMLElement>('[data-collab-control]') : null;
  return el?.dataset.collabControl ?? null;
}

export function useBroadcastLocalActivity(active: boolean, route: string | null): void {
  const broadcast = useCollabStore((state) => state.broadcast);
  const nextSeq = useCollabStore((state) => state.nextSeq);
  const self = useCollabStore((state) => state.self);

  useEffect(() => {
    if (!active || !self || !route) return;
    broadcast({ t: 'nav', actor: self.id, seq: nextSeq(), route });
  }, [active, self, route, broadcast, nextSeq]);

  useEffect(() => {
    if (!active || !self || typeof document === 'undefined') return undefined;
    const onFocusIn = (event: FocusEvent) => {
      const id = controlIdOf(event.target);
      if (id) broadcast({ t: 'focus', actor: self.id, seq: nextSeq(), elementId: id });
    };
    const onFocusOut = (event: FocusEvent) => {
      if (controlIdOf(event.target)) broadcast({ t: 'focus', actor: self.id, seq: nextSeq(), elementId: null });
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [active, self, broadcast, nextSeq]);
}
