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

export type DockTab = "terminal" | "problems" | "output" | "ports";

export const DOCK_MIN_HEIGHT = 120;
export const DOCK_DEFAULT_HEIGHT = 260;

/** Clamp a dock height (px) to [DOCK_MIN_HEIGHT, floor(viewport × 0.7)]. */
export function clampDockHeight(px: number, viewportHeight: number): number {
  const knownViewport = Number.isFinite(viewportHeight) && viewportHeight > 0;
  const max = Math.max(DOCK_MIN_HEIGHT, knownViewport ? Math.floor(viewportHeight * 0.7) : DOCK_DEFAULT_HEIGHT);
  const wanted = Number.isFinite(px) ? px : DOCK_DEFAULT_HEIGHT;
  return Math.round(Math.max(DOCK_MIN_HEIGHT, Math.min(wanted, max)));
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
export const DOCK_TABS: readonly DockTab[] = Object.freeze(["terminal", "problems", "output", "ports"]);

/** Return true only if value is one of the four known dock tab strings. */
export function isDockTab(value: unknown): value is DockTab {
  return typeof value === "string" && DOCK_TABS.includes(value as DockTab);
}
