/**
 * Node pass: draw each node as a pre-baked glassy orb sprite (glow + sheen + rim),
 * scaled to its degree-derived radius and faded/scaled in during the reveal.
 * Batched by color so each sprite is fetched once; drawImage per node is cheap.
 */

import type { DrawCtx } from "./drawTypes";
import { nodeInView } from "./cull";
import { nodeReveal } from "./reveal";
import { DISC_FRACTION, type NodeSpriteCache } from "./sprites";

export function drawNodes(d: DrawCtx, sprites: NodeSpriteCache, focusOnly = false): void {
  const { ctx, state, view, visual, time, reveal } = d;
  const cullScale = visual.nodeScale * 2.2; // include glow padding in the cull margin
  for (const [color, indices] of state.colorBuckets) {
    const sprite = sprites.get(color);
    for (const i of indices) {
      if (focusOnly && !(d.focus?.has(i) ?? false)) continue;
      if (!nodeInView(state, i, view, cullScale)) continue;
      const rv = nodeReveal(reveal, i, time);
      if (rv <= 0.001) continue;
      const r = state.radius[i] * visual.nodeScale * (0.45 + 0.55 * rv);
      const half = r / DISC_FRACTION;
      ctx.globalAlpha = rv * d.alpha;
      ctx.drawImage(sprite, state.posX[i] - half, state.posY[i] - half, half * 2, half * 2);
    }
  }
  ctx.globalAlpha = 1;
}
