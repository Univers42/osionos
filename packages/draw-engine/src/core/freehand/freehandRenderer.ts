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
  // Per-element outline cache (mirrors roughRenderer's drawable cache — one
  // entry per id, overwritten on change, no eviction). Validity is the points
  // ARRAY IDENTITY plus the stroke size — NOT element.version: the in-flight
  // freedraw gesture grows `points` and the pointer-up normalisation shifts
  // them without bumping the version, while every mutation path replaces the
  // array (never edits in place), so the reference is the exact change signal.
  const cache = new Map<string, { points: Array<[number, number]>; size: number; outline: number[][] }>();
  return {
    outline(element) {
      const points = element.points ?? [];
      const size = strokeSize(element);
      const entry = cache.get(element.id);
      if (entry && entry.points === points && entry.size === size) return entry.outline;
      const outline = getStroke(points, {
        size,
        thinning: 0.6,
        smoothing: 0.5,
        streamline: 0.5,
        last: true,
      });
      cache.set(element.id, { points, size, outline });
      return outline;
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
