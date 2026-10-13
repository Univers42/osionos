/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SidebarEdgePeek.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 06:55:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 06:55:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// With the sidebar hidden, nothing floats over the content. Resting the pointer
// against the left edge slides the sidebar in over the page; leaving it slides
// it back. The pin (or Ctrl+Alt+B) docks it again.

import React, { useCallback, useEffect, useRef, useState } from "react";

import { useUIStore } from "@/shared/config/uiStore";
import { ActivitySidebar } from "./ActivitySidebar";
import styles from "./SidebarEdgePeek.module.scss";

/** Ponytail: "deliberate" is a guess. A pointer parked on the screen edge
 *  (to reach a scrollbar on the left, say) still opens it after 250ms; a
 *  trackpad that overshoots the 6px strip never does. A pointer already on the
 *  edge when the sidebar hides must leave it once before it can peek. Ctrl+Alt+B
 *  always works. */
const REVEAL_DELAY_MS = 250;
const HIDE_DELAY_MS = 300;

interface Props {
  onOpenSettings?: () => void;
  onOpenTrash?: () => void;
  onOpenConsole?: () => void;
}

export const SidebarEdgePeek: React.FC<Props> = (props) => {
  const hidden = useUIStore((s) => s.sidebarMode === "hidden");
  const [arming, setArming] = useState(false);
  const [open, setOpen] = useState(false);
  const [pointerWasAway, setPointerWasAway] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const edgeRef = useRef<HTMLDivElement>(null);

  const clearTimers = useCallback(() => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    revealTimer.current = null;
    hideTimer.current = null;
  }, []);

  // Docked again (pin, Ctrl+Alt+B): the peek has nothing left to do.
  useEffect(() => {
    if (hidden) return undefined;
    clearTimers();
    return undefined;
  }, [hidden, clearTimers]);
  useEffect(() => clearTimers, [clearTimers]);
  if (!hidden && (open || arming || pointerWasAway)) {
    setOpen(false);
    setArming(false);
    setPointerWasAway(false);
  }

  // Dragging the sidebar shut ends with the pointer on the strip, which then
  // appears under it. The strip arms only once the pointer has been seen
  // away from it, so the sidebar that was just hidden does not peek back.
  useEffect(() => {
    if (!hidden || pointerWasAway) return undefined;
    const onMove = (event: PointerEvent) => {
      const right = edgeRef.current?.getBoundingClientRect().right ?? 0;
      if (event.clientX > right) setPointerWasAway(true);
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, [hidden, pointerWasAway]);

  const onEdgeEnter = () => {
    if (!pointerWasAway) return;
    setArming(true);
    revealTimer.current = setTimeout(() => {
      setArming(false);
      setOpen(true);
    }, REVEAL_DELAY_MS);
  };
  const onEdgeLeave = () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = null;
    setArming(false);
  };
  const scheduleHide = useCallback(() => {
    // Focus inside (a menu, the filter box) keeps it open.
    if (hideTimer.current || overlayRef.current?.contains(document.activeElement)) return;
    hideTimer.current = setTimeout(() => {
      hideTimer.current = null;
      setOpen(false);
    }, HIDE_DELAY_MS);
  }, []);
  const cancelHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);

  // While open, follow the pointer on the whole document: the overlay appears
  // under a still pointer, which gets no pointerenter, so its own leave event
  // cannot be trusted. Right of the overlay = leaving; back over it = staying.
  useEffect(() => {
    if (!open) return undefined;
    const onMove = (event: PointerEvent) => {
      const right = overlayRef.current?.getBoundingClientRect().right ?? 0;
      if (event.clientX > right) scheduleHide();
      else cancelHide();
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, [open, scheduleHide, cancelHide]);

  if (!hidden) return null;

  return (
    <>
      <div
        ref={edgeRef}
        aria-hidden
        data-sidebar-edge
        data-arming={arming ? "" : undefined}
        className={styles.edge}
        onPointerEnter={onEdgeEnter}
        onPointerLeave={onEdgeLeave}
      />
      <div
        ref={overlayRef}
        data-sidebar-peek
        data-open={open ? "" : undefined}
        className={styles.overlay}
        inert={!open}
        onBlur={(event) => { if (!overlayRef.current?.contains(event.relatedTarget as Node | null)) scheduleHide(); }}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
      >
        <ActivitySidebar {...props} peek />
      </div>
    </>
  );
};
