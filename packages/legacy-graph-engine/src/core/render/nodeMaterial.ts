/**
 * Shared node-material primitives. The mode materials live beside this file —
 * dark "aurora glass" in `nodeGlassDark.ts`, light "porcelain enamel" in
 * `nodeEnamelLight.ts` — and `nodeShapes.ts` (which owns the paint ORDER)
 * dispatches between them. Everything is baked once per `shape|color|glyph`
 * sprite key (LRU-cached in `sprites.ts`) and blitted with a single
 * `drawImage` per node, so the whole material budget costs ZERO per frame.
 *
 * Colour is never the only signal (the shape language in `nodeShape.ts`
 * carries kind), and every tone derives from the theme + the node's own hue —
 * no palette is hardcoded here.
 */

import type { SpriteStyle } from "./nodeShape";
import { type Rgb, darken, normalizeRgb, rgb, rgba } from "../theme/shade";

const TAU = Math.PI * 2;

/** Filled circle — the primitive every material builds on. */
export function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** Stroked circle — the other primitive (bands, lips, hairlines). */
export function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
}

/**
 * Soft ambient occlusion pooled under the body — the contact that seats a node
 * on the field. Dark only: the light material gets the same read from the
 * sheet's baked drop shadow, and stacking both would muddy the cream.
 */
export function paintContactShadow(
  ctx: CanvasRenderingContext2D,
  half: number,
  r: number,
  style: SpriteStyle,
): void {
  if (style.mode === "light") return;
  const shadow = normalizeRgb(ctx, style.shadow);
  const cy = half + r * 0.14; // pooled slightly below — light comes from above
  const grad = ctx.createRadialGradient(half, cy, r * 0.86, half, cy, r * 1.52);
  grad.addColorStop(0, rgba(shadow, 0.5));
  grad.addColorStop(1, rgba(shadow, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, half * 2, half * 2);
}

/** Inner ring that marks a note orb — distinct from a plain record disc. */
export function paintNoteMark(
  ctx: CanvasRenderingContext2D,
  half: number,
  r: number,
  base: Rgb,
  style: SpriteStyle,
): void {
  ctx.lineWidth = r * 0.13;
  ctx.strokeStyle =
    style.mode === "light" ? rgb(darken(base, 0.25)) : "rgba(255, 246, 232, 0.82)";
  ring(ctx, half, half, r * 0.5);
}
