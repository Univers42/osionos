/**
 * Pure geometry for the draw-a-shape gesture: the world-space rect spanned by a
 * drag, with an optional 1:1 lock (Shift). Node-tested; the engine owns the draft
 * element lifecycle (create-on-down, resize-on-move, commit-on-up).
 */

import { normalizeRect } from "../scene/geometry";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The rect spanned by a drag from (sx,sy) to (cx,cy). `square` locks it 1:1. */
export function rectFromDrag(sx: number, sy: number, cx: number, cy: number, square = false): Rect {
  let dx = cx - sx;
  let dy = cy - sy;
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * side;
    dy = (dy < 0 ? -1 : 1) * side;
  }
  return normalizeRect(sx, sy, dx, dy);
}

/** A drag below this threshold (world units) was a click, not a shape → discard. */
export function isDegenerateRect(rect: Rect, min = 2): boolean {
  return rect.width < min && rect.height < min;
}
