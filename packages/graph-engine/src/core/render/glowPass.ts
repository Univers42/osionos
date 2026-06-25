/**
 * Emphasis glow — drawn UNDER the node sprites with additive compositing. Unlike
 * the old per-node baked halo (which made every node muddy), glow now signals
 * importance: a faint ambient bloom on high-degree hubs (scaled by the Glow
 * control, and decorative → skipped under reduced motion), and a brighter bloom on
 * the hovered + selected nodes (functional → always shown). Only a handful of nodes
 * glow, so this stays cheap.
 */

import type { DrawCtx } from "./drawTypes";

export function drawGlow(d: DrawCtx, hoverIndex: number, selectedIndex: number): void {
  const { ctx, state, visual, theme, cull } = d;
  // Light "paper": additive bloom washes out on cream — emphasis is carried by the
  // baked node shadow, the terracotta rings, and the dim-others pass instead.
  if (theme.mode === "light") return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  if (!d.reducedMotion && visual.glow > 0.001) {
    // Ambient bloom is reserved for the hub set (≤32 gradients per frame).
    for (let k = 0; k < cull.count; k += 1) {
      const i = cull.list[k];
      if (state.isHub[i] !== 1) continue;
      glowAt(d, i, state.fills[i], 0.1 * visual.glow, 2.4);
    }
  }

  // Warm-dark: keep the bloom but recolor to the terracotta select/hover and trim
  // strength so it reads as a calm ember, not neon.
  if (hoverIndex >= 0 && hoverIndex !== selectedIndex) glowAt(d, hoverIndex, theme.hoverRing, 0.35, 2.6);
  if (selectedIndex >= 0) glowAt(d, selectedIndex, theme.selectRing, 0.55, 3.1);

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
