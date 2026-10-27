/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePresenceFrame.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Keeps one PresenceFrame current for the overlay. Measuring is coalesced to one
 * animation frame however many triggers fire (scroll, resize, a remote move, a
 * local edit, an idle timer), and the frame is the only React state: nothing here
 * re-renders the editor, which is only observed.
 *
 * `scrollingRef` is flipped as a DOM attribute rather than state, so starting and
 * stopping a scroll costs the overlay no render: CSS drops the 90 ms glide while
 * content moves under it every frame and restores it once the scroll settles.
 */

import { useEffect, useState, type RefObject } from 'react';

import { usePageStore } from '@/store/usePageStore';
import { useCollabStore } from '../store/useCollabStore';
import { scrollerEl } from '../model/presenceDom';
import { measurePresence, type PresenceFrame } from '../model/presenceFrame';

const SCROLL_SETTLE_MS = 140;
/** Added to the idle timer so the re-measure lands after, never before, the cutoff. */
const IDLE_SLACK_MS = 20;

export function usePresenceFrame(layerRef: RefObject<HTMLElement | null>): PresenceFrame | null {
  const cursors = useCollabStore((state) => state.cursors);
  const members = useCollabStore((state) => state.members);
  const status = useCollabStore((state) => state.status);
  const pageId = usePageStore((state) => state.activePage?.id ?? null);
  const [frame, setFrame] = useState<PresenceFrame | null>(null);

  useEffect(() => {
    if (status !== 'live') return undefined;
    let raf: number | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let observed: HTMLElement | null = null;

    const measure = (): void => {
      raf = null;
      const next = measurePresence(cursors, members, Date.now());
      setFrame(next);
      clearTimeout(idleTimer);
      if (next.idleIn !== null) idleTimer = setTimeout(schedule, next.idleIn + IDLE_SLACK_MS);
      // The page switch replaces the scroll area; follow it so edits keep landing.
      const scroller = scrollerEl();
      if (scroller !== observed) {
        edits.disconnect();
        observed = scroller;
        if (scroller) edits.observe(scroller, { childList: true, subtree: true, characterData: true });
      }
    };
    const schedule = (): void => { raf ??= requestAnimationFrame(measure); };
    const edits = new MutationObserver(schedule);

    const onScroll = (): void => {
      const layer = layerRef.current;
      layer?.setAttribute('data-scrolling', '');
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => layer?.removeAttribute('data-scrolling'), SCROLL_SETTLE_MS);
      schedule();
    };

    schedule();
    window.addEventListener('scroll', onScroll, true); // capture: nested scrollers do not bubble
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', schedule);
      edits.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
      clearTimeout(idleTimer);
      clearTimeout(settleTimer);
    };
  }, [cursors, members, status, pageId, layerRef]);

  return status === 'live' ? frame : null;
}
