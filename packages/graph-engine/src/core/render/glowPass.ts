/**
 * Emphasis glow — drawn UNDER the node sprites with additive compositing. Unlike
 * the old per-node baked halo (which made every node muddy), glow now signals
 * importance: a faint ambient bloom on high-degree hubs (scaled by the Glow
 * control, and decorative → skipped under reduced motion), and a brighter bloom on
 * the hovered + selected nodes (functional → always shown). Only a handful of nodes
 * glow, so this stays cheap.
 */

import type { DrawCtx } from "./drawTypes";
import { nodeInView } from "./cull";
import { MAX_RADIUS, MIN_RADIUS } from "./sceneState";

const HUB_WEIGHT = 0.7;
const HUB_RADIUS = MIN_RADIUS + HUB_WEIGHT * (MAX_RADIUS - MIN_RADIUS);

export function drawGlow(d: DrawCtx, hoverIndex: number, selectedIndex: number): void {
  const { ctx, state, view, visual, theme } = d;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  if (!d.reducedMotion && visual.glow > 0.001) {
    for (let i = 0; i < state.count; i += 1) {
      if (state.visible[i] === 0 || state.radius[i] < HUB_RADIUS) continue;
      if (!nodeInView(state, i, view, visual.nodeScale * 4)) continue;
      glowAt(d, i, state.fills[i], 0.12 * visual.glow, 2.4);
    }
  }

  if (hoverIndex >= 0 && hoverIndex !== selectedIndex) glowAt(d, hoverIndex, theme.hoverRing, 0.45, 2.6);
  if (selectedIndex >= 0) glowAt(d, selectedIndex, theme.selectRing, 0.8, 3.1);

  ctx.globalAlpha = 1;
  ctx.restore();
}

function glowAt(d: DrawCtx, i: number, color: string, strength: number, radiusMul: number): void {
  const { ctx, state, visual } = d;
  if (i >= state.count || state.visible[i] === 0) return;
  const x = state.posX[i];
  const y = state.posY[i];
  const r = Math.max(1, state.radius[i] * visual.nodeScale * radiusMul);
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "transparent");
  ctx.globalAlpha = strength * d.alpha;
  ctx.fillStyle = grad;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
