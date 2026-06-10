/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useHugHeights.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useRef, useState } from "react";

const HUG_EPSILON_PX = 1;
const HUG_DEBOUNCE_MS = 150;

export interface HugHeights {
  /** Measured content heights of hug-sized cells (cellId -> px); a new Map per (debounced) change. */
  heights: ReadonlyMap<string, number>;
  /** Callback: attach a hug cell's content element, null detaches. */
  measureCell: (cellId: string, element: HTMLElement | null) => void;
}

/**
 * One ResizeObserver for every hug-sized cell of a stage, reading
 * `contentRect` from the entries (no getBoundingClientRect/scrollHeight
 * forced layouts — the legacy editor's per-keystroke jank source). Heights
 * are PRESENTATION state: they depend on this stage's rendered width and are
 * never persisted.
 */
export function useHugHeights(): HugHeights {
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(() => new Map());
  const stateRef = useRef<{
    observer: ResizeObserver | null;
    cellsByElement: Map<Element, string>;
    elementsByCell: Map<string, Element>;
    live: Map<string, number>;
    timer: ReturnType<typeof setTimeout> | null;
  }>(null!);
  stateRef.current ??= { observer: null, cellsByElement: new Map(), elementsByCell: new Map(), live: new Map(), timer: null };

  const measureCell = useCallback((cellId: string, element: HTMLElement | null) => {
    const state = stateRef.current;
    const scheduleCommit = () => {
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(() => {
        state.timer = null;
        setHeights(new Map(state.live));
      }, HUG_DEBOUNCE_MS);
    };

    if (!element) {
      const previous = state.elementsByCell.get(cellId);
      if (previous) {
        state.observer?.unobserve(previous);
        state.cellsByElement.delete(previous);
        state.elementsByCell.delete(cellId);
      }
      if (state.live.delete(cellId)) scheduleCommit();
      return;
    }

    if (typeof ResizeObserver === "undefined") return;
    state.observer ??= new ResizeObserver((entries) => {
      let moved = false;
      for (const entry of entries) {
        const id = state.cellsByElement.get(entry.target);
        if (!id) continue;
        const height = entry.contentRect.height;
        const previous = state.live.get(id) ?? 0;
        if (Math.abs(height - previous) <= HUG_EPSILON_PX) continue;
        state.live.set(id, height);
        moved = true;
      }
      if (moved) scheduleCommit();
    });
    state.cellsByElement.set(element, cellId);
    state.elementsByCell.set(cellId, element);
    state.observer.observe(element);
  }, []);

  useEffect(() => () => {
    const state = stateRef.current;
    if (state.timer) clearTimeout(state.timer);
    state.observer?.disconnect();
  }, []);

  return { heights, measureCell };
}
