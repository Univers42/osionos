/**
 * Node pass: draw each node as a pre-baked flat sprite (backing + body + rim,
 * by shape), scaled to its degree-derived radius and faded/scaled in during
 * the reveal. Batched by `shape|color|glyph` so each sprite is fetched once;
 * drawImage per node is cheap. Semantic zoom picks the sprite variant per
 * frame: FAR uses the icon-less base sprite (one per shape|color — the hot
 * path at scale), the MID band crossfades the icon variant in on top, and the
 * card stage fades sprites out entirely.
 */

import type { DrawCtx } from "./drawTypes";
import { lodMix } from "./lod";
import { nodeReveal } from "./reveal";
import { baseKeyOf, shapeOf, styleKey } from "./nodeShape";
import { DISC_FRACTION, type NodeSpriteCache } from "./sprites";
import { glyphKey, iconGlyph } from "./nodeIcon";

export function drawNodes(d: DrawCtx, sprites: NodeSpriteCache, focusOnly = false): void {
  const { ctx, state, visual, time, reveal, cull, camera } = d;
  const mix = lodMix(camera.scale, visual.semanticZoom);
  if (mix.sprite <= 0.001) return; // full card stage — no sprites at all
  for (const [key, indices] of state.styleBuckets) {
    const base = mix.icon < 0.999 ? sprites.get(baseKeyOf(key)) : null;
    const iconed = mix.icon > 0.001 ? sprites.get(key) : null;
    for (const i of indices) {
      if (cull.mask[i] === 0) continue;
      if (focusOnly && !(d.focus?.has(i) ?? false)) continue;
      const rv = nodeReveal(reveal, i, time);
      if (rv <= 0.001) continue;
      const r = state.radius[i] * visual.nodeScale * (0.45 + 0.55 * rv);
      const half = r / DISC_FRACTION;
      const alpha = rv * d.alpha * mix.sprite;
      if (base) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(base, state.posX[i] - half, state.posY[i] - half, half * 2, half * 2);
      }
      if (iconed) {
        ctx.globalAlpha = alpha * mix.icon;
        ctx.drawImage(iconed, state.posX[i] - half, state.posY[i] - half, half * 2, half * 2);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** Re-blit one node's sprite on top — used to "raise" the hovered/selected node. */
export function drawNodeSprite(d: DrawCtx, sprites: NodeSpriteCache, i: number): void {
  const { ctx, state, visual, camera } = d;
  if (i < 0 || i >= state.count || state.visible[i] === 0) return;
  const mix = lodMix(camera.scale, visual.semanticZoom);
  if (mix.sprite <= 0.001) return; // the card pass raises its own accent cards
  const glyph = mix.icon > 0.5 ? glyphKey(iconGlyph(state.icon[i] ?? null, state.label[i])) : "";
  const sprite = sprites.get(styleKey(shapeOf(state.kind[i]), state.fills[i], glyph));
  const half = (state.radius[i] * visual.nodeScale) / DISC_FRACTION;
  ctx.globalAlpha = d.alpha * mix.sprite;
  ctx.drawImage(sprite, state.posX[i] - half, state.posY[i] - half, half * 2, half * 2);
  ctx.globalAlpha = 1;
}
