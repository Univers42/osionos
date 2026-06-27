/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   alignOps.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { unionFrames } from "./geometry";
import type { CanvasCell, CanvasFrame } from "./types";

export type CanvasAlignEdge = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** Align ≥2 selected cells to a shared edge/centre of their bounding box.
 *  Returns a frame patch for `updateCellFrames` (single commit, undoable). */
export function alignFrames(cells: CanvasCell[], ids: ReadonlySet<string>, edge: CanvasAlignEdge): Record<string, CanvasFrame> {
  const targets = cells.filter((cell) => ids.has(cell.id));
  if (targets.length < 2) return {};
  const bounds = unionFrames(targets.map((cell) => cell.frame));
  const frames: Record<string, CanvasFrame> = {};
  for (const cell of targets) {
    const frame = cell.frame;
    let { x, y } = frame;
    if (edge === "left") x = bounds.x;
    else if (edge === "right") x = bounds.x + bounds.width - frame.width;
    else if (edge === "hcenter") x = bounds.x + (bounds.width - frame.width) / 2;
    else if (edge === "top") y = bounds.y;
    else if (edge === "bottom") y = bounds.y + bounds.height - frame.height;
    else if (edge === "vcenter") y = bounds.y + (bounds.height - frame.height) / 2;
    frames[cell.id] = { ...frame, x: Math.round(Math.max(0, x)), y: Math.round(Math.max(0, y)) };
  }
  return frames;
}

/** Distribute ≥3 selected cells so the gaps between them are equal along an axis. */
export function distributeFrames(cells: CanvasCell[], ids: ReadonlySet<string>, axis: "x" | "y"): Record<string, CanvasFrame> {
  const targets = cells.filter((cell) => ids.has(cell.id));
  if (targets.length < 3) return {};
  const size = (frame: CanvasFrame) => (axis === "x" ? frame.width : frame.height);
  const pos = (frame: CanvasFrame) => (axis === "x" ? frame.x : frame.y);
  const sorted = [...targets].sort((a, b) => pos(a.frame) - pos(b.frame));
  const first = sorted[0].frame;
  const last = sorted[sorted.length - 1].frame;
  const span = pos(last) + size(last) - pos(first);
  const usable = sorted.reduce((sum, cell) => sum + size(cell.frame), 0);
  const gap = (span - usable) / (sorted.length - 1);
  const frames: Record<string, CanvasFrame> = {};
  let cursor = pos(first);
  for (const cell of sorted) {
    frames[cell.id] = axis === "x"
      ? { ...cell.frame, x: Math.round(cursor) }
      : { ...cell.frame, y: Math.round(cursor) };
    cursor += size(cell.frame) + gap;
  }
  return frames;
}
