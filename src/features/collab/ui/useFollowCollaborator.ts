/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useFollowCollaborator.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Follow mode's engine: while a collaborator is followed, an animation-frame loop
 * keeps their caret inside the middle band of the editor by scrolling it, and
 * ends the moment the person takes over (wheel, touch, Escape) or the followed
 * member leaves. It returns the editor's box (for the frame drawn around it) and
 * a polite announcement for screen readers.
 *
 * Caveat: only wheel, touch and Escape count as taking over. Dragging the scroll
 * bar or scrolling with Page Down / Space does not release the follow, so the
 * loop pulls the caret back; Escape or the chip's Stop button ends it.
 */

import { useEffect, useState } from 'react';

import { prefersReducedMotion } from '@/entities/page/ui/coverMedia';
import { useCollabStore } from '../store/useCollabStore';
import { memberIdOf } from '../model/collabActor';
import { useFollowStore } from '../model/followStore';
import {
  boxOf, placeCaret, scrollerEl, viewportOf, type Box,
} from '../model/presenceDom';
import { followScrollDelta } from '../model/presenceGeometry';

/** Share of the remaining distance covered each frame: an ease-out of ~250 ms. */
const EASE = 0.2;
/** While the followed block is not mounted, scroll toward it by this many screens per frame. */
const CHASE_SCREENS = 0.5;

function nameOf(actor: string): string {
  const memberId = memberIdOf(actor);
  return useCollabStore.getState().members.find((member) => member.memberId === memberId)?.displayName ?? 'collaborator';
}

function sameBox(a: Box | null, b: Box): boolean {
  return a !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

export function useFollowCollaborator(): { box: Box | null; message: string } {
  const following = useFollowStore((state) => state.following);
  const [box, setBox] = useState<Box | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // The name is remembered at follow time: once the member has left, the
    // roster can no longer say who it was.
    let lastName = 'collaborator';
    return useFollowStore.subscribe((state, previous) => {
      if (state.following === previous.following) return;
      if (state.following) {
        lastName = nameOf(state.following);
        setMessage(`Following ${lastName}`);
      } else {
        setMessage(`Stopped following ${lastName}`);
      }
    });
  }, []);

  useEffect(() => {
    if (following === null) return undefined;
    const target = following;
    const reduced = prefersReducedMotion();
    let raf = 0;
    let lastBox: Box | null = null;

    const release = (state: ReturnType<typeof useCollabStore.getState>): void => {
      useFollowStore.getState().releaseIfGone(state.cursors, new Set(state.members.map((member) => member.memberId)));
    };
    const stop = (): void => useFollowStore.getState().stop();
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') stop(); };

    function tick(): void {
      raf = requestAnimationFrame(tick);
      const scroller = scrollerEl();
      if (!scroller) return;
      const viewport = viewportOf(scroller);
      const current = boxOf(viewport);
      if (!sameBox(lastBox, current)) { lastBox = current; setBox(current); }

      const caret = useCollabStore.getState().cursors.get(target)?.caret;
      const place = caret ? placeCaret(caret, viewport) : null;
      if (!place) return;
      if (!place.rect) {
        scroller.scrollTop += (place.band === 'above' ? -1 : 1) * viewport.height * CHASE_SCREENS;
        return;
      }
      const delta = followScrollDelta({ top: place.rect.top, bottom: place.rect.top + place.rect.height }, viewport);
      if (delta === null) return;
      // At least 1px a frame, so the ease never stalls just short of the target.
      scroller.scrollTop += reduced ? delta : Math.sign(delta) * Math.max(1, Math.abs(delta) * EASE);
    }

    const unsubscribe = useCollabStore.subscribe(release);
    release(useCollabStore.getState());
    raf = requestAnimationFrame(tick);
    window.addEventListener('wheel', stop, { passive: true, capture: true });
    window.addEventListener('touchmove', stop, { passive: true, capture: true });
    window.addEventListener('keydown', onKey);
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
      window.removeEventListener('wheel', stop, true);
      window.removeEventListener('touchmove', stop, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [following]);

  return { box, message };
}
