/**
 * Compose one node sprite — the "Warm Constellation" node.
 *
 * This file owns the ORDER (shadow → moat → body → kind mark) and the MODE
 * dispatch; the materials own the LIGHTING — dark "aurora glass" in
 * `nodeGlassDark.ts`, light "porcelain enamel" in `nodeEnamelLight.ts`. Three
 * silhouettes share one light: disc = record, ring = tag hub, note = ringed
 * orb — so kind is legible from shape alone, never from colour alone. All
 * tones derive from the theme (`style.*`) and the node's own hue.
 *
 * Baked once per `shape|color|glyph` and blitted per node, so the material
 * depth here is free at render time — see `nodeMaterial.ts`.
 */

import type { NodeShape, SpriteStyle } from "./nodeShape";
import { normalizeRgb } from "../theme/shade";
import { disc, paintContactShadow, paintNoteMark } from "./nodeMaterial";
import { paintGlassBody, paintGlassRing } from "./nodeGlassDark";
import { paintEnamelBody, paintEnamelRing } from "./nodeEnamelLight";

export const SPRITE = 128;
/** Body radius as a fraction of the sprite half-size (rest is shadow + moat + rim room). */
export const DISC_FRACTION = 0.6;

/** Paint a node of `shape`/`color` centered in a SPRITE×SPRITE context. */
export function paintNode(
  ctx: CanvasRenderingContext2D,
  shape: NodeShape,
  color: string,
  style: SpriteStyle,
): void {
  const half = SPRITE / 2;
  const r = half * DISC_FRACTION;
  const base = normalizeRgb(ctx, color); // oklch / hex / rgb → one tone to light from
  const light = style.mode === "light";

  paintContactShadow(ctx, half, r, style);
  paintBacking(ctx, half, r, style);
  if (shape === "ring") {
    (light ? paintEnamelRing : paintGlassRing)(ctx, half, r, base, style);
    return;
  }
  (light ? paintEnamelBody : paintGlassBody)(ctx, half, r, base, style);
  if (shape === "note") paintNoteMark(ctx, half, r, base, style);
}

/** The "moat" just larger than the body — the key legibility win on any backdrop. */
function paintBacking(
  ctx: CanvasRenderingContext2D,
  half: number,
  r: number,
  style: SpriteStyle,
): void {
  if (style.mode === "light") {
    // White sheet + a baked warm drop shadow — the soft lift that replaces glow on cream.
    ctx.save();
    ctx.shadowColor = style.shadow;
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = style.backing;
    disc(ctx, half, half, r * 1.12);
    ctx.restore();
    return;
  }
  ctx.fillStyle = style.backing;
  disc(ctx, half, half, r * 1.12);
}
