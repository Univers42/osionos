/**
 * Pressure-stroke (perfect-freehand) rendering for freedraw elements. The library
 * is dynamically imported so it stays out of the warm chunk. `getStroke` returns a
 * filled outline polygon for the input points; until it loads, the engine draws a
 * plain polyline. Pure-ish (one canvas fill); the points→bbox math is node-tested.
 */

import type { DrawElement } from "../scene/element";

export interface FreehandAdapter {
  /** The outline polygon (screen-agnostic world points, element-local). */
  outline(element: DrawElement): number[][];
}

function strokeSize(element: DrawElement): number {
  return element.strokeWidth * 3 + 4;
}

/** Dynamically import perfect-freehand and return an outline generator. */
export async function loadFreehandAdapter(): Promise<FreehandAdapter> {
  const { getStroke } = await import("perfect-freehand");
  return {
    outline(element) {
      const points = element.points ?? [];
      return getStroke(points, {
        size: strokeSize(element),
        thinning: 0.6,
        smoothing: 0.5,
        streamline: 0.5,
        last: true,
      });
    },
  };
}

/** Bounding box of a freedraw's local points, [minX, minY, maxX, maxY]. */
export function pointsBounds(points: ReadonlyArray<readonly [number, number]>): [number, number, number, number] {
  if (points.length === 0) return [0, 0, 0, 0];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}
