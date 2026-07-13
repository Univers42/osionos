/**
 * Align + distribute over a multi-selection. Pure: returns only the MOVED
 * elements (the caller puts them back and re-derives bindings, which re-centres
 * any bound labels for free).
 */

import type { DrawElement } from "../scene/element";
import { elementBounds, sceneBounds } from "../scene/geometry";

export type AlignMode = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

/** Selected elements worth moving directly: labels follow their container and
 *  locked elements stay put. */
function movable(elements: readonly DrawElement[], ids: ReadonlySet<string>): DrawElement[] {
  return elements.filter(
    (element) => ids.has(element.id) && !element.isDeleted && !element.locked && !element.containerId,
  );
}

/** Align every selected element to the selection's own bounds. */
export function alignElements(
  elements: readonly DrawElement[],
  ids: ReadonlySet<string>,
  mode: AlignMode,
): DrawElement[] {
  const targets = movable(elements, ids);
  if (targets.length < 2) return [];
  const bounds = sceneBounds(targets);
  if (!bounds) return [];

  return targets.map((element) => {
    const b = elementBounds(element);
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = bounds.minX - b.minX;
    if (mode === "right") dx = bounds.maxX - b.maxX;
    if (mode === "centerX") dx = (bounds.minX + bounds.maxX) / 2 - (b.minX + b.maxX) / 2;
    if (mode === "top") dy = bounds.minY - b.minY;
    if (mode === "bottom") dy = bounds.maxY - b.maxY;
    if (mode === "centerY") dy = (bounds.minY + bounds.maxY) / 2 - (b.minY + b.maxY) / 2;
    return { ...element, x: element.x + dx, y: element.y + dy };
  });
}

/** Spread the selection so element CENTRES are evenly spaced along `axis`
 *  (first and last stay put). Needs at least three elements. */
export function distributeElements(
  elements: readonly DrawElement[],
  ids: ReadonlySet<string>,
  axis: "x" | "y",
): DrawElement[] {
  const targets = movable(elements, ids);
  if (targets.length < 3) return [];

  const centre = (element: DrawElement): number => {
    const b = elementBounds(element);
    return axis === "x" ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2;
  };
  const sorted = [...targets].sort((a, b) => centre(a) - centre(b));
  const first = centre(sorted[0]);
  const step = (centre(sorted[sorted.length - 1]) - first) / (sorted.length - 1);

  return sorted.map((element, index) => {
    const delta = first + step * index - centre(element);
    if (axis === "x") return { ...element, x: element.x + delta };
    return { ...element, y: element.y + delta };
  });
}
