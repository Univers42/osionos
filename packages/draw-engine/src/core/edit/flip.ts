/**
 * Flip a selection about its own bounds. Pure — returns the changed elements.
 * Three geometry families flip differently: bbox shapes mirror their rect,
 * origin-anchored linears negate their point deltas, normalised freedraw
 * strokes mirror points within their own box.
 */

import type { DrawElement } from "../scene/element";
import { normalizeRect, sceneBounds } from "../scene/geometry";
import { isLinearElement } from "../scene/binding";

export type FlipAxis = "horizontal" | "vertical";

function flipOne(element: DrawElement, axis: FlipAxis, lo: number, hi: number): DrawElement {
  const horizontal = axis === "horizontal";
  // ponytail: −angle is exact for our symmetric shapes; asymmetric types would
  // need per-axis angle mirroring.
  const angle = element.angle ? -element.angle : 0;

  if (isLinearElement(element)) {
    const points = (element.points ?? []).map(([px, py]): [number, number] =>
      horizontal ? [-px, py] : [px, -py],
    );
    return horizontal
      ? { ...element, x: lo + hi - element.x, width: -element.width, points, angle }
      : { ...element, y: lo + hi - element.y, height: -element.height, points, angle };
  }

  const rect = normalizeRect(element.x, element.y, element.width, element.height);
  if (element.type === "freedraw") {
    const points = (element.points ?? []).map(([px, py]): [number, number] =>
      horizontal ? [rect.width - px, py] : [px, rect.height - py],
    );
    return horizontal
      ? { ...element, ...rect, x: lo + hi - (rect.x + rect.width), points, angle }
      : { ...element, ...rect, y: lo + hi - (rect.y + rect.height), points, angle };
  }

  return horizontal
    ? { ...element, ...rect, x: lo + hi - (rect.x + rect.width), angle }
    : { ...element, ...rect, y: lo + hi - (rect.y + rect.height), angle };
}

/** Mirror the selected elements about the selection bounds' centre line. */
export function flipElements(
  elements: readonly DrawElement[],
  ids: ReadonlySet<string>,
  axis: FlipAxis,
): DrawElement[] {
  const targets = elements.filter(
    (element) => ids.has(element.id) && !element.isDeleted && !element.locked && !element.containerId,
  );
  if (targets.length === 0) return [];
  const bounds = sceneBounds(targets);
  if (!bounds) return [];
  const lo = axis === "horizontal" ? bounds.minX : bounds.minY;
  const hi = axis === "horizontal" ? bounds.maxX : bounds.maxY;
  return targets.map((element) => flipOne(element, axis, lo, hi));
}
