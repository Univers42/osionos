/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useCoverReposition.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/08 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useRef, useState } from "react";

import { clampCoverPosition, nextCoverPosition } from "./coverPositionMath";

type DragState = { startY: number; startPos: number; height: number };

/**
 * Interactive vertical reposition for a page cover image: enter `active` mode,
 * drag the image up/down to set the focal point (with a live `position` preview),
 * then `save` (commit once) or `cancel`/Escape (revert). Pointer-based, so it
 * works with mouse and touch; `onCommit` is called only on save with a changed
 * value, so a plain click never spams the persistence layer.
 */
export function useCoverReposition(position: number, onCommit: (next: number) => void) {
  const [active, setActive] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const drag = useRef<DragState | null>(null);

  const start = useCallback(() => { setActive(true); setPreview(null); }, []);
  const cancel = useCallback(() => { setActive(false); setPreview(null); drag.current = null; }, []);
  const save = useCallback(() => {
    const next = clampCoverPosition(preview ?? position);
    if (next !== position) onCommit(next);
    setActive(false); setPreview(null); drag.current = null;
  }, [preview, position, onCommit]);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (!active) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { startY: event.clientY, startPos: preview ?? position, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [active, preview, position]);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    setPreview(nextCoverPosition(state.startPos, event.clientY - state.startY, state.height));
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, cancel]);

  return {
    active,
    position: preview ?? position,
    start,
    cancel,
    save,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}
