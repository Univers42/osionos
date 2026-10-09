/**
 * Visibility culling + hit-testing over the columnar SceneState. The spatial
 * grid makes both O(visible) instead of O(n): `frameCull` sweeps the grid ONCE
 * per frame into a reused mask + index list that every render pass shares, and
 * `hitTest` checks only the 3×3 cell neighborhood under the pointer (brute
 * force kept as the small-graph fast path).
 */

import type { WorldBounds } from "../camera/transform";
import { MAX_RADIUS, type SceneState } from "./sceneState";

/** Is node `i` visible (filter on) AND within the view rect (with its radius)? */
export function nodeInView(state: SceneState, i: number, view: WorldBounds, scale: number): boolean {
  if (state.visible[i] === 0) return false;
  const r = state.radius[i] * scale;
  return (
    state.posX[i] + r >= view.minX &&
    state.posX[i] - r <= view.maxX &&
    state.posY[i] + r >= view.minY &&
    state.posY[i] - r <= view.maxY
  );
}

/** Does the edge a–b's bounding box intersect the view rect? */
export function segmentInView(state: SceneState, a: number, b: number, view: WorldBounds): boolean {
  const minX = Math.min(state.posX[a], state.posX[b]);
  const maxX = Math.max(state.posX[a], state.posX[b]);
  const minY = Math.min(state.posY[a], state.posY[b]);
  const maxY = Math.max(state.posY[a], state.posY[b]);
  return maxX >= view.minX && minX <= view.maxX && maxY >= view.minY && minY <= view.maxY;
}

export interface FrameCull {
  /** 1 where the node is visible-in-view this frame (length ≥ state.count). */
  mask: Uint8Array;
  /** Packed indices of in-view nodes (first `count` entries valid). */
  list: Int32Array;
  count: number;
}

const scratch: FrameCull = { mask: new Uint8Array(0), list: new Int32Array(0), count: 0 };

/** One grid sweep per frame; pads with the most generous consumer (glow ×4). */
export function frameCull(state: SceneState, view: WorldBounds, nodeScale: number): FrameCull {
  if (scratch.mask.length < state.count) {
    scratch.mask = new Uint8Array(state.count);
    scratch.list = new Int32Array(state.count);
  } else {
    scratch.mask.fill(0, 0, state.count);
  }
  let n = 0;
  const pad = MAX_RADIUS * nodeScale * 4;
  state.grid.rebuild(state.posX, state.posY, state.count);
  state.grid.queryRect(view, pad, (i) => {
    if (state.visible[i] === 0 || scratch.mask[i] === 1) return;
    scratch.mask[i] = 1;
    scratch.list[n] = i;
    n += 1;
  });
  scratch.count = n;
  return scratch;
}

/** Nearest visible node within reach of a world point, or -1. */
export function hitTest(state: SceneState, worldX: number, worldY: number, nodeScale: number): number {
  let best = -1;
  let bestDist = Infinity;
  const check = (i: number): void => {
    if (state.visible[i] === 0) return;
    const dx = state.posX[i] - worldX;
    const dy = state.posY[i] - worldY;
    const reach = state.radius[i] * nodeScale + 4;
    const dist = dx * dx + dy * dy;
    if (dist <= reach * reach && dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  };
  if (state.count < 256) {
    for (let i = 0; i < state.count; i += 1) check(i);
  } else {
    state.grid.rebuild(state.posX, state.posY, state.count);
    state.grid.queryPoint(worldX, worldY, check);
  }
  return best;
}
