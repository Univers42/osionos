/**
 * Object snapping while moving: the dragged selection's edges/centres magnetise
 * to other elements' edges/centres within a small threshold, and the match is
 * reported as a guide line to paint. Pure — bounds in, adjusted delta + guides
 * out. (Excalidraw's "snap to objects"; hold Alt to bypass.)
 */

import type { WorldBounds } from "../camera/transform";

export interface SnapGuide {
  /** "x" = a vertical guide at world x `at`; "y" = a horizontal one at `at`. */
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

function stops(min: number, max: number): number[] {
  return [min, (min + max) / 2, max];
}

interface AxisHit {
  delta: number;
  at: number;
  other: WorldBounds;
}

function bestAxisSnap(
  movingStops: number[],
  statics: readonly WorldBounds[],
  pick: (b: WorldBounds) => number[],
  threshold: number,
): AxisHit | null {
  let best: AxisHit | null = null;
  for (const other of statics) {
    for (const target of pick(other)) {
      for (const stop of movingStops) {
        const delta = target - stop;
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, at: target, other };
        }
      }
    }
  }
  return best;
}

/**
 * Snap a selection being moved. `moving` is where the selection WOULD land with
 * the raw pointer delta already applied; the returned dx/dy is the extra
 * correction (0,0 = no snap).
 */
export function snapMove(moving: WorldBounds, statics: readonly WorldBounds[], threshold: number): SnapResult {
  const x = bestAxisSnap(stops(moving.minX, moving.maxX), statics, (b) => stops(b.minX, b.maxX), threshold);
  const y = bestAxisSnap(stops(moving.minY, moving.maxY), statics, (b) => stops(b.minY, b.maxY), threshold);

  const guides: SnapGuide[] = [];
  if (x) {
    guides.push({
      axis: "x",
      at: x.at,
      from: Math.min(moving.minY + (y?.delta ?? 0), x.other.minY),
      to: Math.max(moving.maxY + (y?.delta ?? 0), x.other.maxY),
    });
  }
  if (y) {
    guides.push({
      axis: "y",
      at: y.at,
      from: Math.min(moving.minX + (x?.delta ?? 0), y.other.minX),
      to: Math.max(moving.maxX + (x?.delta ?? 0), y.other.maxX),
    });
  }
  return { dx: x?.delta ?? 0, dy: y?.delta ?? 0, guides };
}
