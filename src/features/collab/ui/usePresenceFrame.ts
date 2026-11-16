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
 * Keeps one PresenceFrame current for the overlay. Measurements are coalesced to
 * one animation frame for remote moves, edits and resizes. During scrolling, it
 * defers geometry reads and React updates until the scroll settles, so the fixed
 * overlay does not track scroll position with JavaScript.
 *
 * `data-scrolling` is toggled directly on the layer rather than through React state.
 * CSS hides the stale frame while its content moves, then the overlay is measured
 * once and shown again after that frame has rendered.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';

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
  const latest = useRef({ cursors, members });
  latest.current = { cursors, members };
  const scheduleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (status !== 'live') return undefined;
    let raf: number | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let observed: HTMLElement | null = null;
    let scrolling = false;
    let flagged: HTMLElement | null = null;

    const measure = (): void => {
      raf = null;
      const current = latest.current;
      const next = measurePresence(current.cursors, current.members, Date.now());
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
      // Keep the fixed overlay hidden until this settled measurement has rendered.
      if (flagged) {
        const layer = flagged;
        requestAnimationFrame(() => {
          if (scrolling) return;
          layer.removeAttribute('data-scrolling');
          if (flagged === layer) flagged = null;
        });
      }
    };
    const schedule = (): void => {
      if (scrolling) return;
      raf ??= requestAnimationFrame(measure);
    };
    const onScroll = (): void => {
      scrolling = true;
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      flagged = layerRef.current;
      flagged?.setAttribute('data-scrolling', '');
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        scrolling = false;
        schedule();
      }, SCROLL_SETTLE_MS);
    };
    const edits = new MutationObserver(schedule);

    scheduleRef.current = schedule;
    schedule();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', schedule);
      edits.disconnect();
      if (raf !== null) cancelAnimationFrame(raf);
      clearTimeout(idleTimer);
      clearTimeout(settleTimer);
      flagged?.removeAttribute('data-scrolling');
      scheduleRef.current = null;
    };
  }, [status, pageId, layerRef]);

  // Cursor/member changes still update the overlay, but the scheduler defers them
  // while a scroll is in progress and measures the latest values after it settles.
  useEffect(() => {
    if (status !== 'live') return;
    scheduleRef.current?.();
  }, [cursors, members, status, pageId]);

  return status === 'live' ? frame : null;
}
