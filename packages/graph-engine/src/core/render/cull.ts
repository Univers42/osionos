/**
 * Viewport culling + brute-force hit-testing over the columnar SceneState
 * (≈0.2 ms at 10k). Positions move every layout tick, so a spatial index would
 * need rebuilding each frame; brute force wins until the >10k upgrade.
 */

import type { WorldBounds } from "../camera/transform";
import type { SceneState } from "./sceneState";

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

/** Nearest visible node within reach of a world point, or -1. */
export function hitTest(state: SceneState, worldX: number, worldY: number, nodeScale: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < state.count; i += 1) {
    if (state.visible[i] === 0) continue;
    const dx = state.posX[i] - worldX;
    const dy = state.posY[i] - worldY;
    const reach = state.radius[i] * nodeScale + 4;
    const dist = dx * dx + dy * dy;
    if (dist <= reach * reach && dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}
