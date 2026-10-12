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

// LANE D STUB — unit D1 implements these bodies, keeping every export.

export type DockTab = "terminal" | "problems" | "output" | "ports";

export const DOCK_MIN_HEIGHT = 120;
export const DOCK_DEFAULT_HEIGHT = 260;

/** Clamp a dock height (px) to [DOCK_MIN_HEIGHT, floor(viewport × 0.7)]. */
export function clampDockHeight(px: number, viewportHeight: number): number {
  void viewportHeight;
  return Math.max(DOCK_MIN_HEIGHT, px);
}

/** One-shot import of the legacy IDE-mode persist blob ("osio.ide.mode"). */
export function migrateFromIdeMode(raw: string | null): { dockOpen: boolean } | null {
  void raw;
  return null;
}
