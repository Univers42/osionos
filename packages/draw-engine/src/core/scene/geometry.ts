/**
 * Pure geometry over elements: bounds, normalisation, and per-type hit-testing.
 * No DOM — unit-tested headless. Rotation-aware hit-testing arrives with the
 * select/transform tooling; Phase 0 tests axis-aligned shapes.
 */

import type { WorldBounds } from "../camera/transform";
import type { DrawElement } from "./element";

/** Normalise a drag rect (possibly negative w/h) to a positive-extent box. */
export function normalizeRect(x: number, y: number, width: number, height: number): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

/** Axis-aligned world bounds of a single element. */
export function elementBounds(element: DrawElement): WorldBounds {
  const rect = normalizeRect(element.x, element.y, element.width, element.height);
  return { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height };
}

/** Union bounds of many elements, or null when empty. */
export function sceneBounds(elements: readonly DrawElement[]): WorldBounds | null {
  let bounds: WorldBounds | null = null;
  for (const element of elements) {
    if (element.isDeleted) continue;
    const b = elementBounds(element);
    if (!bounds) {
      bounds = { ...b };
      continue;
    }
    bounds.minX = Math.min(bounds.minX, b.minX);
    bounds.minY = Math.min(bounds.minY, b.minY);
    bounds.maxX = Math.max(bounds.maxX, b.maxX);
    bounds.maxY = Math.max(bounds.maxY, b.maxY);
  }
  return bounds;
}

/** Shortest distance from a point to the segment ab (0 when the segment is a dot). */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-9) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Is world point (wx, wy) inside `element` (± tolerance in world units)? */
export function hitTestElement(element: DrawElement, wx: number, wy: number, tolerance = 0): boolean {
  // A line/arrow is hit ON ITS STROKE — a bbox test would make the empty triangle
  // beside a diagonal connector grab every click meant for what sits behind it.
  if (element.type === "line" || element.type === "arrow") {
    const points = element.points ?? [];
    if (points.length < 2) return false;
    const reach = Math.max(tolerance, element.strokeWidth) + 4;
    for (let i = 1; i < points.length; i += 1) {
      const ax = element.x + points[i - 1][0];
      const ay = element.y + points[i - 1][1];
      const bx = element.x + points[i][0];
      const by = element.y + points[i][1];
      if (distanceToSegment(wx, wy, ax, ay, bx, by) <= reach) return true;
    }
    return false;
  }

  const { x, y, width, height } = normalizeRect(element.x, element.y, element.width, element.height);
  const t = tolerance;
  if (wx < x - t || wx > x + width + t || wy < y - t || wy > y + height + t) return false;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2 + t;
  const ry = height / 2 + t;
  if (rx <= 0 || ry <= 0) return true;
  const nx = (wx - cx) / rx;
  const ny = (wy - cy) / ry;
  switch (element.type) {
    case "ellipse":
      return nx * nx + ny * ny <= 1;
    case "diamond":
      return Math.abs(nx) + Math.abs(ny) <= 1;
    default:
      return true; // rectangle / frame / image / embed → the bbox test above
  }
}

/**
 * Topmost element at a world point, or null. Iterates back-to-front (last drawn
 * wins) since draw order is the element order.
 */
export function hitTest(elements: readonly DrawElement[], wx: number, wy: number, tolerance = 0): DrawElement | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (element.isDeleted) continue;
    if (hitTestElement(element, wx, wy, tolerance)) return element;
  }
  return null;
}
