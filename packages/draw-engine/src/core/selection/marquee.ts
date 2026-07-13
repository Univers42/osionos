/**
 * Marquee (rubber-band) selection: the drag rect and the elements whose bounds
 * overlap it. Pure — node-tested.
 */

import type { WorldBounds } from "../camera/transform";
import type { DrawElement } from "../scene/element";
import { elementBounds } from "../scene/geometry";

/** The world rect spanned by a marquee drag from (sx,sy) to (cx,cy). */
export function marqueeRect(sx: number, sy: number, cx: number, cy: number): WorldBounds {
  return {
    minX: Math.min(sx, cx),
    minY: Math.min(sy, cy),
    maxX: Math.max(sx, cx),
    maxY: Math.max(sy, cy),
  };
}

function overlaps(a: WorldBounds, b: WorldBounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Ids of live elements whose axis-aligned bounds intersect `rect`. */
export function elementsInMarquee(elements: readonly DrawElement[], rect: WorldBounds): string[] {
  const out: string[] = [];
  for (const element of elements) {
    if (element.isDeleted) continue;
    if (overlaps(elementBounds(element), rect)) out.push(element.id);
  }
  return out;
}
