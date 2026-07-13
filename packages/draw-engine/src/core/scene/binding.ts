/**
 * Element BINDING — what makes a diagram a diagram rather than loose ink.
 *
 * Two links, both stored as plain ids on the element (see element.ts):
 *  - a line/arrow endpoint bound to a shape (`startBinding` / `endBinding`), and
 *  - a text element bound INSIDE a shape as its label (`containerId`).
 *
 * Neither stores a position. The geometry is DERIVED here on every change, so a
 * bound arrow re-anchors to the shape's edge and a label re-centres itself the
 * moment the shape moves or resizes — no stale coordinates to keep in sync.
 *
 * Pure: no DOM, no canvas. Unit-tested headless.
 */

import type { DrawElement } from "./element";
import { normalizeRect } from "./geometry";

/** Gap left between a shape's edge and the arrow tip that points at it. */
export const BINDING_GAP = 6;
/** Padding between a container's edge and its centred label. */
export const LABEL_PADDING = 8;

export interface Point {
  x: number;
  y: number;
}

/** Line/arrow — the two element types whose endpoints can bind. */
export function isLinearElement(element: DrawElement): boolean {
  return element.type === "line" || element.type === "arrow";
}

/** Shapes an arrow may attach to (and a label may live in). Linears and text are
 *  not bindable targets — an arrow binds to a box, never to another arrow. */
export function isBindableElement(element: DrawElement): boolean {
  return element.type === "rectangle" || element.type === "diamond" || element.type === "ellipse";
}

export function elementCenter(element: DrawElement): Point {
  const rect = normalizeRect(element.x, element.y, element.width, element.height);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * The point on `shape`'s outline in the direction of `toward`, pushed out by `gap`.
 * Solves the ray/outline intersection per shape family, so an arrow lands on the
 * ellipse's curve or the diamond's facet rather than on its bounding box.
 */
export function attachPoint(shape: DrawElement, toward: Point, gap = BINDING_GAP): Point {
  const rect = normalizeRect(shape.x, shape.y, shape.width, shape.height);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const rx = Math.max(rect.width / 2, 0.5);
  const ry = Math.max(rect.height / 2, 0.5);

  let dx = toward.x - cx;
  let dy = toward.y - cy;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return { x: cx, y: cy };
  dx /= length;
  dy /= length;

  // Distance from the centre to the outline along (dx,dy).
  let t: number;
  if (shape.type === "ellipse") {
    t = 1 / Math.hypot(dx / rx, dy / ry);
  } else if (shape.type === "diamond") {
    t = 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry);
  } else {
    // Rectangle: whichever axis the ray exits first.
    const tx = Math.abs(dx) < 1e-6 ? Infinity : rx / Math.abs(dx);
    const ty = Math.abs(dy) < 1e-6 ? Infinity : ry / Math.abs(dy);
    t = Math.min(tx, ty);
  }
  const reach = t + gap;
  return { x: cx + dx * reach, y: cy + dy * reach };
}

/** Topmost bindable shape under a world point, or null. Back-to-front = last drawn wins. */
export function bindableAt(
  elements: readonly DrawElement[],
  x: number,
  y: number,
  tolerance = 0,
  excludeId?: string,
): DrawElement | null {
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const element = elements[i];
    if (element.isDeleted || element.id === excludeId || !isBindableElement(element)) continue;
    const rect = normalizeRect(element.x, element.y, element.width, element.height);
    if (
      x >= rect.x - tolerance &&
      x <= rect.x + rect.width + tolerance &&
      y >= rect.y - tolerance &&
      y <= rect.y + rect.height + tolerance
    ) {
      return element;
    }
  }
  return null;
}

/** Absolute world endpoints of a 2-point linear element. */
export function linearEndpoints(element: DrawElement): { start: Point; end: Point } {
  const points = element.points ?? [[0, 0], [0, 0]];
  const first = points[0] ?? [0, 0];
  const last = points[points.length - 1] ?? [0, 0];
  return {
    start: { x: element.x + first[0], y: element.y + first[1] },
    end: { x: element.x + last[0], y: element.y + last[1] },
  };
}

/** Rebuild a linear's x/y/points/bbox from two absolute world endpoints. */
export function linearFromEndpoints(element: DrawElement, start: Point, end: Point): DrawElement {
  return {
    ...element,
    x: start.x,
    y: start.y,
    width: end.x - start.x,
    height: end.y - start.y,
    points: [
      [0, 0],
      [end.x - start.x, end.y - start.y],
    ],
  };
}

/** Centre a label inside its container. On a shape it fills the inner box; on a
 *  connector it keeps its own measured size, centred at the midpoint (for a
 *  2-point linear the bbox centre IS the segment midpoint). */
export function layoutLabel(label: DrawElement, container: DrawElement): DrawElement {
  if (isLinearElement(container)) {
    const { start, end } = linearEndpoints(container);
    return {
      ...label,
      x: (start.x + end.x) / 2 - label.width / 2,
      y: (start.y + end.y) / 2 - label.height / 2,
      angle: 0,
    };
  }
  const rect = normalizeRect(container.x, container.y, container.width, container.height);
  const width = Math.max(8, rect.width - LABEL_PADDING * 2);
  return {
    ...label,
    x: rect.x + LABEL_PADDING,
    y: rect.y + rect.height / 2 - label.height / 2,
    width,
    angle: container.angle,
  };
}

/**
 * Re-derive every bound endpoint and every contained label across the scene.
 * Called after ANY geometry change (draw, move, resize, undo) — cheap, and it is
 * the single place bound geometry is computed, so nothing can drift.
 */
export function refreshBindings(elements: readonly DrawElement[]): DrawElement[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const live = (id: string | null | undefined): DrawElement | null => {
    if (!id) return null;
    const found = byId.get(id);
    return found && !found.isDeleted ? found : null;
  };

  // Pass 1: connectors re-anchor to their shapes. The map is updated as we go so
  // pass 2 lays labels out on the connector's NEW geometry, not last frame's.
  const linearsDone = elements.map((element) => {
    if (element.isDeleted || !isLinearElement(element)) return element;
    const startShape = live(element.startBinding);
    const endShape = live(element.endBinding);
    if (!startShape && !endShape) return element;

    const { start, end } = linearEndpoints(element);
    // Aim each bound end at the OTHER end (its shape's centre when that end is
    // also bound), so both tips face each other across the connection.
    const startTarget = endShape ? elementCenter(endShape) : end;
    const endTarget = startShape ? elementCenter(startShape) : start;
    const nextStart = startShape ? attachPoint(startShape, startTarget) : start;
    const nextEnd = endShape ? attachPoint(endShape, endTarget) : end;
    const next = linearFromEndpoints(element, nextStart, nextEnd);
    byId.set(next.id, next);
    return next;
  });

  // Pass 2: labels re-centre inside their (possibly just-moved) containers.
  return linearsDone.map((element) => {
    if (element.isDeleted || element.type !== "text" || !element.containerId) return element;
    const container = live(element.containerId);
    return container ? layoutLabel(element, container) : element;
  });
}
