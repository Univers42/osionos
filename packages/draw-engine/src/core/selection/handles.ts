/**
 * Selection-handle geometry: the 8 resize handles + 1 rotate handle around a
 * (possibly rotated) element, plus the element's rotated corners. Pure world-space
 * math — the overlay projects to screen; the engine hit-tests. Node-tested.
 */

import type { DrawElement } from "../scene/element";

export type HandleKind = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

export const RESIZE_HANDLES: HandleKind[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export interface HandlePoint {
  kind: HandleKind;
  x: number;
  y: number;
}

/** Rotate (px,py) around the origin by `angle` radians. */
export function rotatePoint(px: number, py: number, angle: number): { x: number; y: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: px * c - py * s, y: px * s + py * c };
}

/** Local (unrotated) offset of a resize handle from the element centre. */
export function handleLocalPoint(kind: HandleKind, halfW: number, halfH: number): { x: number; y: number } {
  const x = kind.includes("w") ? -halfW : kind.includes("e") ? halfW : 0;
  const y = kind.includes("n") ? -halfH : kind.includes("s") ? halfH : 0;
  return { x, y };
}

/** The element's four corners in world space (rotation-applied), TL→TR→BR→BL. */
export function selectionCorners(element: DrawElement): Array<{ x: number; y: number }> {
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const hw = element.width / 2;
  const hh = element.height / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([lx, ly]) => {
    const r = rotatePoint(lx, ly, element.angle);
    return { x: cx + r.x, y: cy + r.y };
  });
}

/** World-space handle points. `rotateGap` (world units = screen px / scale) keeps
 *  the rotate handle a constant screen distance above the element. */
export function selectionHandlePoints(element: DrawElement, rotateGap: number): HandlePoint[] {
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const hw = element.width / 2;
  const hh = element.height / 2;
  const points: HandlePoint[] = RESIZE_HANDLES.map((kind) => {
    const local = handleLocalPoint(kind, hw, hh);
    const r = rotatePoint(local.x, local.y, element.angle);
    return { kind, x: cx + r.x, y: cy + r.y };
  });
  const rotate = rotatePoint(0, -hh - rotateGap, element.angle);
  points.push({ kind: "rotate", x: cx + rotate.x, y: cy + rotate.y });
  return points;
}

/** The handle within `tolerance` (world units) of (wx,wy), or null. Rotate wins
 *  ties (it sits apart), then the resize handles in order. */
export function hitHandle(points: HandlePoint[], wx: number, wy: number, tolerance: number): HandleKind | null {
  for (const point of points) {
    if (Math.abs(wx - point.x) <= tolerance && Math.abs(wy - point.y) <= tolerance) return point.kind;
  }
  return null;
}
