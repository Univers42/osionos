/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePaneZoomGestures.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 02:40:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 02:40:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect } from "react";

import { isPaneZoomEnabled } from "@/shared/config/featureFlags";

import { recordPaneHit, wheelZoom } from "../model/paneZoom";
import { useWorkspaceLayout } from "../model/workspaceLayout";

function paneIdOf(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest("[data-osio-pane]")?.getAttribute("data-osio-pane") || null;
}

/**
 * The document-level half of pane zoom, mounted once by WorkspaceGrid.
 * It remembers which pane the user last pointed at or focused, which is the pane
 * the keyboard zoom commands act on, and it turns Ctrl+wheel over a pane into
 * that pane's zoom. Anywhere else the wheel event is not touched, so the browser
 * zooms the page.
 */
export function usePaneZoomGestures(): void {
  useEffect(() => {
    if (!isPaneZoomEnabled()) return;
    let travelled = 0;

    const onSelect = (event: Event): void => {
      const target = event.target;
      recordPaneHit({
        paneId: paneIdOf(target),
        insideApp: target instanceof Element && target.closest("#root") !== null,
      });
    };

    // Bubble phase on purpose: a surface inside the pane that gives the wheel
    // its own meaning (a drawing canvas, a diagram, a map) has run by now and
    // called preventDefault, which is how it says the event is taken.
    const onWheel = (event: WheelEvent): void => {
      if (event.defaultPrevented || !event.ctrlKey) return;
      const paneId = paneIdOf(event.target);
      if (!paneId) return;

      event.preventDefault();
      recordPaneHit({ paneId, insideApp: true });
      const next = wheelZoom(travelled, event.deltaY, event.deltaMode === WheelEvent.DOM_DELTA_PIXEL);
      travelled = next.travelled;
      if (next.change) useWorkspaceLayout.getState().zoomPane(paneId, next.change);
    };

    document.addEventListener("pointerdown", onSelect, true);
    document.addEventListener("focusin", onSelect, true);
    // Not passive: preventDefault is what stops the browser zooming the page too.
    document.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("pointerdown", onSelect, true);
      document.removeEventListener("focusin", onSelect, true);
      document.removeEventListener("wheel", onWheel);
    };
  }, []);
}
