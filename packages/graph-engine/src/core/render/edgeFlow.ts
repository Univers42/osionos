/**
 * Hover "energy flow": the hovered node's edges re-stroke on top of the base
 * links in the glow tint, with a slowly drifting directional dash so the
 * connections read as live circuits flowing outward. O(degree) via the CSR
 * edge index. Selected nodes get the same emphasis as a STATIC stroke, and
 * reduced motion renders solid lines (no drift) for both.
 */

import type { DrawCtx } from "./drawTypes";

const DASH_ON = 3;
const DASH_OFF = 9;
const DRIFT_PER_MS = 0.06;

/** Stroke the emphasis pass for one node's edges (no-op for index < 0). */
export function drawEdgeFlow(d: DrawCtx, index: number, animate: boolean): void {
  const { ctx, state, theme, camera, time } = d;
  if (index < 0 || index >= state.count || state.visible[index] === 0) return;
  const { nodeEdgeOffsets, nodeEdgeList, edgeFrom, edgeTo } = state.edges;
  const s = camera.scale;
  ctx.save();
  ctx.strokeStyle = theme.glow;
  ctx.lineWidth = 1.1 / s;
  ctx.lineCap = "round";
  if (animate && !d.reducedMotion) ctx.setLineDash([DASH_ON / s, DASH_OFF / s]);
  for (let k = nodeEdgeOffsets[index]; k < nodeEdgeOffsets[index + 1]; k += 1) {
    const e = nodeEdgeList[k];
    const from = edgeFrom[e];
    const to = edgeTo[e];
    if (state.visible[from] === 0 || state.visible[to] === 0) continue;
    if (animate && !d.reducedMotion) {
      // Drift runs AWAY from the emphasized node along each edge.
      const sign = from === index ? -1 : 1;
      ctx.lineDashOffset = sign * ((time * DRIFT_PER_MS) / s);
    }
    ctx.globalAlpha = 0.7 * d.alpha;
    ctx.beginPath();
    ctx.moveTo(state.posX[from], state.posY[from]);
    ctx.lineTo(state.posX[to], state.posY[to]);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
