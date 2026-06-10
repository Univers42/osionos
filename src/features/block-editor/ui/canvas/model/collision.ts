/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   collision.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { bottom, framesIntersect } from "./geometry";
import type { CanvasCell, CanvasFrame } from "./types";

// Push-down collision policy: cells the user just placed are immovable
// obstacles; every other cell that overlaps one slides straight down to the
// first free row-gap below it, cascading in reading order. This replaces the
// legacy "silently revert the gesture" behaviour.

/** Returns displaced frames for the non-moved cells (empty when nothing overlaps). */
export function resolveOverlapsByPushDown(
  cells: CanvasCell[],
  movedIds: ReadonlySet<string>,
  rowGap: number,
  effectiveHeights?: ReadonlyMap<string, number>,
): Record<string, CanvasFrame> {
  const effective = (cell: CanvasCell, frame: CanvasFrame): CanvasFrame => {
    const measured = effectiveHeights?.get(cell.id);
    return measured && measured > frame.height ? { ...frame, height: measured } : frame;
  };
  const obstacles: CanvasFrame[] = cells
    .filter((cell) => movedIds.has(cell.id))
    .map((cell) => effective(cell, cell.frame));
  const displaced: Record<string, CanvasFrame> = {};
  const rest = cells
    .filter((cell) => !movedIds.has(cell.id))
    .sort((left, right) => left.frame.y - right.frame.y || left.frame.x - right.frame.x);

  for (const cell of rest) {
    let frame = cell.frame;
    for (let guard = 0; guard <= cells.length; guard += 1) {
      const blocker = obstacles.find((obstacle) => framesIntersect(effective(cell, frame), obstacle));
      if (!blocker) break;
      frame = { ...frame, y: bottom(blocker) + rowGap };
    }
    if (frame !== cell.frame) displaced[cell.id] = frame;
    obstacles.push(effective(cell, frame));
  }
  return displaced;
}

/**
 * Render-time displacement for hug-sized cells whose measured content height
 * outgrew their authored frame. PRESENTATION state only: measured heights
 * depend on this stage's rendered width, so the result must never be
 * persisted (two panes at different widths would overwrite each other's
 * frames through the shared store — the legacy React #185 crash).
 */
export function resolveHugDisplacements(
  cells: CanvasCell[],
  measuredHeights: ReadonlyMap<string, number>,
  rowGap: number,
): Record<string, CanvasFrame> {
  const grownIds = new Set(
    cells
      .filter((cell) => cell.sizing.height === "hug" && (measuredHeights.get(cell.id) ?? 0) > cell.frame.height)
      .map((cell) => cell.id),
  );
  if (grownIds.size === 0) return {};
  return resolveOverlapsByPushDown(cells, grownIds, rowGap, measuredHeights);
}
