/**
 * Hub arc gauges: the top-degree "hub" nodes carry a thin arc around their
 * disc whose sweep encodes the link count relative to the biggest hub — a
 * quiet activity-ring that makes the graph's structure legible at a glance.
 * Bounded by the hub cap (≤32), so this pass is effectively free.
 */

import type { DrawCtx } from "./drawTypes";

const MIN_SWEEP = Math.PI * 0.25;
const MAX_SWEEP = Math.PI * 1.5;
const START = -Math.PI / 2;

export function drawHubArcs(d: DrawCtx): void {
  const { ctx, state, visual, camera, cull } = d;
  const maxDegree = Math.max(1, state.edges.maxHubDegree);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 1.6 / camera.scale;
  for (let k = 0; k < cull.count; k += 1) {
    const i = cull.list[k];
    if (state.isHub[i] !== 1) continue;
    if (d.focus && !d.focus.has(i)) continue;
    const sweep = MIN_SWEEP + (MAX_SWEEP - MIN_SWEEP) * (state.degree[i] / maxDegree);
    const r = state.radius[i] * visual.nodeScale + 5 / camera.scale;
    ctx.globalAlpha = 0.5 * d.alpha;
    ctx.strokeStyle = state.fills[i];
    ctx.beginPath();
    ctx.arc(state.posX[i], state.posY[i], r, START, START + sweep);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
