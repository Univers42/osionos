/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workbenchLayout.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export type DockTab = "terminal" | "problems" | "output" | "debug" | "ports";

export const DOCK_MIN_HEIGHT = 120;
export const DOCK_DEFAULT_HEIGHT = 260;

/** Clamp a dock height (px) to [DOCK_MIN_HEIGHT, floor(viewport × 0.7)]. */
export function clampDockHeight(px: number, viewportHeight: number): number {
  const knownViewport = Number.isFinite(viewportHeight) && viewportHeight > 0;
  const max = Math.max(DOCK_MIN_HEIGHT, knownViewport ? Math.floor(viewportHeight * 0.7) : DOCK_DEFAULT_HEIGHT);
  const wanted = Number.isFinite(px) ? px : DOCK_DEFAULT_HEIGHT;
  return Math.round(Math.max(DOCK_MIN_HEIGHT, Math.min(wanted, max)));
}

export type DockPosition = "bottom" | "left" | "right";

/** Frozen list of dock positions, in the order the position menu shows them. */
export const DOCK_POSITIONS: readonly DockPosition[] = Object.freeze(["bottom", "left", "right"]);

export const DOCK_MIN_WIDTH = 240;
export const DOCK_DEFAULT_WIDTH = 420;
/** Pixels one arrow key moves a dock splitter. */
export const DOCK_KEY_STEP = 16;

/** Return true only if value is one of the three known dock position strings. */
export function isDockPosition(value: unknown): value is DockPosition {
  return typeof value === "string" && DOCK_POSITIONS.includes(value as DockPosition);
}

/** Clamp a side dock width (px) to [DOCK_MIN_WIDTH, max(DOCK_MIN_WIDTH, floor(viewport x 0.5))].
 *  A non-finite width reads as the default; an unknown viewport caps at the default width. */
export function clampDockWidth(px: number, viewportWidth: number): number {
  const knownViewport = Number.isFinite(viewportWidth) && viewportWidth > 0;
  const max = Math.max(DOCK_MIN_WIDTH, knownViewport ? Math.floor(viewportWidth * 0.5) : DOCK_DEFAULT_WIDTH);
  const wanted = Number.isFinite(px) ? px : DOCK_DEFAULT_WIDTH;
  return Math.round(Math.max(DOCK_MIN_WIDTH, Math.min(wanted, max)));
}

/** A phone has no room beside the editor, so it always gets the bottom dock; the stored choice is kept. */
export function effectiveDockPosition(position: DockPosition, phone: boolean): DockPosition {
  return phone ? "bottom" : position;
}

/** The size change of a pointer move for a dock at `position`: dragging toward the editor grows it,
 *  so bottom is from.y - to.y, right is from.x - to.x and left is to.x - from.x. */
export function dockDragDelta(position: DockPosition, from: { x: number; y: number }, to: { x: number; y: number }): number {
  if (position === "bottom") return from.y - to.y;
  return position === "right" ? from.x - to.x : to.x - from.x;
}

const RESIZE_KEYS: Readonly<Record<DockPosition, { grow: string; shrink: string }>> = Object.freeze({
  bottom: { grow: "ArrowUp", shrink: "ArrowDown" },
  right: { grow: "ArrowLeft", shrink: "ArrowRight" },
  left: { grow: "ArrowRight", shrink: "ArrowLeft" },
});

/** The size a key sets on a dock splitter at `position`, clamped to [min, max], or null when the
 *  key is not a resize key there. The arrow that points toward the editor grows the dock;
 *  Home goes to the minimum and End to the maximum. */
export function dockKeySize(position: DockPosition, key: string, shown: number, min: number, max: number): number | null {
  const keys = RESIZE_KEYS[position];
  let next: number;
  if (key === keys.grow) next = shown + DOCK_KEY_STEP;
  else if (key === keys.shrink) next = shown - DOCK_KEY_STEP;
  else if (key === "Home") next = min;
  else if (key === "End") next = max;
  else return null;
  return Math.min(max, Math.max(min, next));
}

/** One-shot import of the legacy IDE-mode persist blob ("osio.ide.mode"). */
export function migrateFromIdeMode(raw: string | null): { dockOpen: boolean } | null {
  if (raw == null || raw === "") {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const state = (parsed as Record<string, unknown>).state;
  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    return null;
  }
  const bottomOpen = (state as Record<string, unknown>).bottomOpen;
  if (typeof bottomOpen !== "boolean") {
    return null;
  }
  return { dockOpen: bottomOpen };
}

/** Frozen list of dock tab names, in the order specified. */
export const DOCK_TABS: readonly DockTab[] = Object.freeze(["terminal", "problems", "output", "debug", "ports"]);

/** Return true only if value is one of the five known dock tab strings. */
export function isDockTab(value: unknown): value is DockTab {
  return typeof value === "string" && DOCK_TABS.includes(value as DockTab);
}

/** Whether the dock is in the page. Once opened, closing it hides it, so a terminal's shell and
 *  its scrollback live on, as in VS Code. The web unmounted it instead, assuming the sandbox
 *  session reconnects; the node terminal (this computer, through its node) has no session to
 *  reconnect to, so every close, and every action that closed the dock, ended the shell. */
export function dockPresence({ open, everOpened }: { open: boolean; everOpened: boolean }): "shown" | "hidden" | "absent" {
  if (open) return "shown";
  return everOpened ? "hidden" : "absent";
}
