/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCoverReposition.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/08 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useRef, useState } from "react";

import { clampCoverPosition, nextCoverPosition } from "./coverPositionMath";

type DragState = { startY: number; startPos: number; height: number };

/**
 * Interactive vertical reposition for a page cover image: enter `active` mode,
 * drag the image up/down to set the focal point, then `save` (commit once) or
 * `cancel`/Escape (revert). The drag itself NEVER renders React: each
 * pointermove stores the live focal % in a ref and paints `object-position`
 * directly on the media element inside one requestAnimationFrame per frame —
 * so the drag runs at display refresh rate no matter how heavy the page is.
 * `onCommit` fires only on save with a changed value.
 */
export function useCoverReposition(position: number, onCommit: (next: number) => void) {
  const [active, setActive] = useState(false);
  const mediaRef = useRef<HTMLElement | null>(null);
  const live = useRef(clampCoverPosition(position));
  const drag = useRef<DragState | null>(null);
  const frame = useRef(0);

  /** Paint the live focal point straight onto the media element (no render). */
  const paint = useCallback(() => {
    frame.current = 0;
    const el = mediaRef.current;
    if (el) el.style.objectPosition = `center ${live.current}%`;
  }, []);

  /** Callback ref — accepts <img> or <video> as the repositionable media. */
  const attachMedia = useCallback((el: HTMLElement | null) => { mediaRef.current = el; }, []);

  const stop = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    drag.current = null;
  }, []);

  const start = useCallback(() => {
    live.current = clampCoverPosition(position);
    setActive(true);
  }, [position]);

  const cancel = useCallback(() => {
    stop();
    live.current = clampCoverPosition(position);
    paint(); // restore — React never rewrites an unchanged style prop
    setActive(false);
  }, [stop, position, paint]);

  const save = useCallback(() => {
    stop();
    const next = clampCoverPosition(live.current);
    if (next !== position) onCommit(next);
    setActive(false);
  }, [stop, position, onCommit]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (!active) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { startY: event.clientY, startPos: live.current, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation(); // keep marquee/selection layers out of the drag
  }, [active]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    event.stopPropagation();
    live.current = nextCoverPosition(state.startPos, event.clientY - state.startY, state.height);
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  }, [paint]);

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  }, []);

  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, cancel]);

  return {
    active,
    position,
    start,
    cancel,
    save,
    attachMedia,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
