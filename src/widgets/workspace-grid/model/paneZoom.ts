/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   paneZoom.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 02:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 02:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Per-pane zoom. Ctrl +/-/0 and Ctrl+wheel zoom the pane the user selected and
// nothing else; with no pane selected they are left to the browser, which zooms
// the whole page. This file is the pure half: the ladder, what a stored value
// may be, and which pane an interaction selects. It imports no DOM and no store
// so tests/canvas can run it.

import { updatePane, type LayoutNode } from "./layoutTree";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
/** The ladder browsers use for page zoom, kept to 50–200%. */
const ZOOM_STEPS = [MIN_ZOOM, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, MAX_ZOOM];
/** Two zoom values closer than this are the same rung (0.1 + 0.2 arithmetic). */
const SAME_STEP = 0.001;

export type PaneZoomChange = "in" | "out" | "reset";

/** A stored zoom as something safe to render. The layout is read back from
 *  localStorage without validation, so this is the validation. */
export function normalizePaneZoom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/** The next rung up or down from `current`; the ends of the ladder hold. */
export function stepPaneZoom(current: number, change: "in" | "out"): number {
  const from = normalizePaneZoom(current);
  if (change === "in") return ZOOM_STEPS.find((step) => step > from + SAME_STEP) ?? MAX_ZOOM;
  let below = MIN_ZOOM;
  for (const step of ZOOM_STEPS) {
    if (step < from - SAME_STEP) below = step;
  }
  return below;
}

/** Wheel travel that makes one zoom step when it arrives in small pieces. */
const WHEEL_STEP = 50;

export interface WheelZoom {
  /** Travel carried over to the next wheel event. */
  travelled: number;
  change: "in" | "out" | null;
}

/** What one Ctrl+wheel event does to a pane's zoom. A notched mouse wheel sends
 *  one large delta per notch (53, 100 and 120 px are all in use; Firefox counts
 *  lines instead) and each notch is one step, as for the browser's own zoom. A
 *  trackpad pinch sends a burst of small deltas, summed until they make a step.
 *  Ponytail: "large" means 50 px or more. A fast two-finger scroll with Ctrl
 *  held sends deltas above that and steps once per event, so it overshoots; a
 *  free-spinning wheel reporting under 50 px per event is summed like a pinch
 *  and feels slower. Either way Ctrl+0 or the percentage chip puts it back. */
export function wheelZoom(travelled: number, deltaY: number, isPixelDelta: boolean): WheelZoom {
  if (deltaY === 0) return { travelled, change: null };
  const change = deltaY < 0 ? "in" : "out";
  if (!isPixelDelta || Math.abs(deltaY) >= WHEEL_STEP) return { travelled: 0, change };
  const total = Math.sign(travelled) === Math.sign(deltaY) ? travelled + deltaY : deltaY;
  if (Math.abs(total) < WHEEL_STEP) return { travelled: total, change: null };
  return { travelled: total - Math.sign(total) * WHEEL_STEP, change };
}

/** The tree with one pane's zoom set. 100% removes the field, so a pane nobody
 *  zoomed is stored exactly as it was before this feature existed. */
export function withPaneZoom(root: LayoutNode, paneId: string, zoom: number): LayoutNode {
  const next = normalizePaneZoom(zoom);
  return updatePane(root, paneId, (pane) => {
    const unzoomed = { ...pane };
    delete unzoomed.zoom;
    return next === 1 ? unzoomed : { ...unzoomed, zoom: next };
  });
}

/** Where a pointer-down or focus landed. */
export interface PaneHit {
  /** The pane it landed in, if any. */
  paneId: string | null;
  /** Whether it landed inside the app shell at all. */
  insideApp: boolean;
}

/** The selected pane after an interaction: a pane selects itself, the rest of
 *  the app (sidebar, top bar) deselects, and anything outside the app shell
 *  leaves the selection alone.
 *  Ponytail: "outside the app shell" stands in for "a menu or popover that
 *  belongs to the pane", because those are portaled to <body>. A portal that
 *  is NOT pane-related (a global dialog) therefore also keeps the selection;
 *  the cost is a pane zoom where a page zoom was meant. Escape hatch: click
 *  the sidebar or top bar first. */
export function nextSelectedPane(current: string | null, hit: PaneHit): string | null {
  if (hit.paneId) return hit.paneId;
  return hit.insideApp ? null : current;
}

let selectedPaneId: string | null = null;

/** The pane the keyboard zoom commands act on; null means "zoom the page". */
export function getSelectedPaneId(): string | null {
  return selectedPaneId;
}

export function recordPaneHit(hit: PaneHit): void {
  selectedPaneId = nextSelectedPane(selectedPaneId, hit);
}
