/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   frameOps.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { clampFrameSize } from "./geometry";
import { getNextZ } from "./selectors";
import type { CanvasCell, CanvasFrame } from "./types";

export const CANVAS_CELL_MIN_SIZE = 48;

/** Multi-cell move patch (keyboard nudge / batch drag commit). */
export function nudgeFrames(cells: CanvasCell[], ids: ReadonlySet<string>, dx: number, dy: number): Record<string, CanvasFrame> {
  const frames: Record<string, CanvasFrame> = {};
  for (const cell of cells) {
    if (!ids.has(cell.id)) continue;
    frames[cell.id] = { ...cell.frame, x: Math.max(0, cell.frame.x + dx), y: Math.max(0, cell.frame.y + dy) };
  }
  return frames;
}

/** Multi-cell resize patch (keyboard shift+arrows), clamped to a usable minimum. */
export function resizeFrames(cells: CanvasCell[], ids: ReadonlySet<string>, dw: number, dh: number): Record<string, CanvasFrame> {
  const frames: Record<string, CanvasFrame> = {};
  for (const cell of cells) {
    if (!ids.has(cell.id)) continue;
    frames[cell.id] = clampFrameSize({ ...cell.frame, width: cell.frame.width + dw, height: cell.frame.height + dh }, CANVAS_CELL_MIN_SIZE);
  }
  return frames;
}

export function bringToFront(cells: CanvasCell[], ids: ReadonlySet<string>): Record<string, number> {
  let next = getNextZ(cells);
  const zs: Record<string, number> = {};
  for (const cell of cells) {
    if (ids.has(cell.id)) zs[cell.id] = next++;
  }
  return zs;
}

export function sendToBack(cells: CanvasCell[], ids: ReadonlySet<string>): Record<string, number> {
  let next = cells.reduce((min, cell) => Math.min(min, cell.z), 0) - 1;
  const zs: Record<string, number> = {};
  for (const cell of cells) {
    if (ids.has(cell.id)) zs[cell.id] = next--;
  }
  return zs;
}
