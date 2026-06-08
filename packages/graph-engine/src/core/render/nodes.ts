/**
 * Node pass: draw each node as a pre-baked flat sprite (matte backing + body +
 * rim, by shape), scaled to its degree-derived radius and faded/scaled in during
 * the reveal. Batched by `shape|color` so each sprite is fetched once; drawImage
 * per node is cheap.
 */

import type { DrawCtx } from "./drawTypes";
import { nodeInView } from "./cull";
import { nodeReveal } from "./reveal";
import { shapeOf, styleKey } from "./nodeShape";
import { DISC_FRACTION, type NodeSpriteCache } from "./sprites";

export function drawNodes(d: DrawCtx, sprites: NodeSpriteCache, focusOnly = false): void {
  const { ctx, state, view, visual, time, reveal } = d;
  const cullScale = visual.nodeScale * 2.2;
  for (const [key, indices] of state.styleBuckets) {
    const sprite = sprites.get(key);
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

/** Re-blit one node's sprite on top — used to "raise" the hovered/selected node. */
export function drawNodeSprite(d: DrawCtx, sprites: NodeSpriteCache, i: number): void {
  const { ctx, state, visual } = d;
  if (i < 0 || i >= state.count || state.visible[i] === 0) return;
  const sprite = sprites.get(styleKey(shapeOf(state.kind[i]), state.fills[i]));
  const half = (state.radius[i] * visual.nodeScale) / DISC_FRACTION;
  ctx.globalAlpha = d.alpha;
  ctx.drawImage(sprite, state.posX[i] - half, state.posY[i] - half, half * 2, half * 2);
  ctx.globalAlpha = 1;
}
