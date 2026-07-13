/**
 * Resize + rotate math. Resize keeps the OPPOSITE handle fixed in world space, so
 * it stays correct for rotated elements (work in the element's local frame around
 * the anchor). Pure — node-tested with the anchor-fixed invariant.
 */

import type { DrawElement } from "../scene/element";
import { type HandleKind, handleLocalPoint, rotatePoint } from "./handles";

export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

const OPPOSITE: Record<Exclude<HandleKind, "rotate">, Exclude<HandleKind, "rotate">> = {
  nw: "se",
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
};

/** New geometry after dragging `handle` to world (wx,wy). The opposite handle
 *  stays fixed in world space. `aspect` (w/h captured at gesture start) locks the
 *  ratio — Shift-resize. */
export function resizeElement(
  element: DrawElement,
  handle: HandleKind,
  wx: number,
  wy: number,
  minSize = 1,
  aspect: number | null = null,
): Geometry {
  if (handle === "rotate") {
    return { x: element.x, y: element.y, width: element.width, height: element.height };
  }
  const angle = element.angle;
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const hw = element.width / 2;
  const hh = element.height / 2;

  const anchorLocal = handleLocalPoint(OPPOSITE[handle], hw, hh);
  const aw = rotatePoint(anchorLocal.x, anchorLocal.y, angle);
  const anchorWorld = { x: cx + aw.x, y: cy + aw.y };

  // Pointer relative to the anchor, back in the element's local (unrotated) frame.
  const rel = rotatePoint(wx - anchorWorld.x, wy - anchorWorld.y, -angle);
  const controlsX = handle.includes("e") || handle.includes("w");
  const controlsY = handle.includes("n") || handle.includes("s");
  let width = Math.max(minSize, controlsX ? Math.abs(rel.x) : element.width);
  let height = Math.max(minSize, controlsY ? Math.abs(rel.y) : element.height);
  if (aspect && Number.isFinite(aspect) && aspect > 0) {
    // Corner: whichever axis grew more (proportionally) leads; edge: the free
    // axis follows the dragged one.
    if (!controlsY || (controlsX && width / aspect >= height)) height = Math.max(minSize, width / aspect);
    else width = Math.max(minSize, height * aspect);
  }

  // Direction from anchor toward the dragged corner, and the new centre.
  const signX = anchorLocal.x <= 0 ? 1 : -1;
  const signY = anchorLocal.y <= 0 ? 1 : -1;
  const offLocalX = controlsX ? (signX * width) / 2 : 0;
  const offLocalY = controlsY ? (signY * height) / 2 : 0;
  const off = rotatePoint(offLocalX, offLocalY, angle);
  const ncx = anchorWorld.x + off.x;
  const ncy = anchorWorld.y + off.y;

  return { x: ncx - width / 2, y: ncy - height / 2, width, height };
}

/** New angle (radians) when dragging the rotate handle to world (wx,wy). The
 *  handle sits above the element, so the pointer angle is offset by +90°. */
export function rotateElement(element: DrawElement, wx: number, wy: number): number {
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  return Math.atan2(wy - cy, wx - cx) + Math.PI / 2;
}
