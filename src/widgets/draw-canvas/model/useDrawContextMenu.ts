/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useDrawContextMenu.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 10:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 10:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useState } from "react";
import { type Arrowhead, type DrawEngine, isLinearElement } from "@osionos/draw-engine";

/** What the right-click landed on — drives which menu sections render. */
export interface DrawMenuState {
  x: number;
  y: number;
  /** null = empty canvas (paste/select-all/fit); else the selected element(s). */
  element: {
    linear: { start: Arrowhead; end: Arrowhead } | null;
    locked: boolean;
    multi: boolean;
    grouped: boolean;
  } | null;
}

/**
 * Right-click menu state + the engine actions it dispatches. The engine has
 * already selected whatever was under the cursor (DrawCanvas does that), so
 * every action just targets the current selection. Shared by the draw block and
 * the full-page Draw surface.
 */
export function useDrawContextMenu(engine: DrawEngine | null) {
  const [menu, setMenu] = useState<DrawMenuState | null>(null);

  const openAt = useCallback(
    (point: { x: number; y: number }) => {
      if (!engine) return;
      const selected = engine.getSelectedElements();
      if (selected.length === 0) {
        setMenu({ x: point.x, y: point.y, element: null });
        return;
      }
      const linear = selected.find((element) => isLinearElement(element));
      setMenu({
        x: point.x,
        y: point.y,
        element: {
          linear: linear
            ? {
                start: linear.startArrowhead ?? "none",
                end: linear.endArrowhead ?? (linear.type === "arrow" ? "arrow" : "none"),
              }
            : null,
          locked: engine.selectionLocked(),
          multi: selected.length > 1,
          grouped: engine.selectionIsGroup(),
        },
      });
    },
    [engine],
  );

  const close = useCallback(() => setMenu(null), []);

  /** Extremity picks keep the menu open (you usually set both ends in one visit). */
  const pickArrowhead = useCallback(
    (patch: { start?: Arrowhead; end?: Arrowhead }) => {
      engine?.setArrowheads(patch);
      setMenu((current) =>
        current?.element?.linear
          ? { ...current, element: { ...current.element, linear: { ...current.element.linear, ...patch } } }
          : current,
      );
    },
    [engine],
  );

  /** Every other action fires once and closes. `paste` lands at the click point. */
  const run = useCallback(
    (action: (engine: DrawEngine, at: { x: number; y: number }) => void) => {
      setMenu((current) => {
        if (engine && current) action(engine, engine.screenToWorld(current.x, current.y));
        return null;
      });
    },
    [engine],
  );

  return { menu, openAt, close, pickArrowhead, run };
}
