/**
 * Light material — "porcelain enamel": a glazed ceramic chip seated on cream
 * paper. Evolves the paper seal: the white sheet + baked drop shadow keep the
 * grounding, but the wide flat identity band becomes a GLAZED enamel ring —
 * lit along the top, deepening toward the base, with a crisp inner definition
 * line and a white sheen glint where the key light catches the glaze. The
 * center stays clean white so glyphs keep maximum legibility. Editorial and
 * high-contrast on cream; still no additive glow, by design.
 *
 * Baked once per sprite key (see `sprites.ts`) — free at render time.
 */

import type { SpriteStyle } from "./nodeShape";
import { type Rgb, darken, lighten, rgb, rgba, saturate } from "../theme/shade";
import { disc, ring } from "./nodeMaterial";

/** Body of a record/note node: white porcelain with a glazed enamel band. */
export function paintEnamelBody(
  ctx: CanvasRenderingContext2D,
  half: number,
  r: number,
  base: Rgb,
  style: SpriteStyle,
): void {
  ctx.fillStyle = "#ffffff";
  disc(ctx, half, half, r);

  // Frost wash — porcelain, not printer-white; deepens toward the base so the
  // chip carries its hue even before the band resolves at small sizes.
  const frost = ctx.createLinearGradient(0, half - r, 0, half + r);
  frost.addColorStop(0, rgba(base, 0.07));
  frost.addColorStop(1, rgba(base, 0.18));
  ctx.fillStyle = frost;
  disc(ctx, half, half, r);

  const inkW = r * 0.05;
  ctx.lineWidth = inkW;
  ctx.strokeStyle = style.rim;
  ring(ctx, half, half, r - inkW * 0.5);

  paintEnamelBand(ctx, half, r, base, inkW);
}

/** The glazed identity ring: graded like fired ceramic, crisply bounded. */
function paintEnamelBand(
  ctx: CanvasRenderingContext2D,
  half: number,
  r: number,
  base: Rgb,
  inkW: number,
): void {
  const bandW = r * 0.15;
  const radius = r - inkW - bandW * 0.5;
  // Saturated glaze: fired enamel is denser in hue than the pigment it started
  // from, and a pale band disappears into the white body at graph sizes.
  const fired = saturate(base, 0.55);
  const glaze = ctx.createLinearGradient(0, half - r, 0, half + r);
  glaze.addColorStop(0, rgb(lighten(fired, 0.08)));
  glaze.addColorStop(1, rgb(darken(fired, 0.3)));
  ctx.lineWidth = bandW;
  ctx.strokeStyle = glaze;
  ring(ctx, half, half, radius);

  // Crisp inner definition so the band never bleeds into the white core.
  ctx.lineWidth = Math.max(0.75, r * 0.022);
  ctx.strokeStyle = rgba(darken(base, 0.3), 0.35);
  ring(ctx, half, half, radius - bandW * 0.5 + ctx.lineWidth * 0.5);

  paintGlazeSheen(ctx, half, radius, bandW * 0.38);
}

/** White glint along the top of a band — the key light catching the glaze. */
function paintGlazeSheen(
  ctx: CanvasRenderingContext2D,
  half: number,
  radius: number,
  width: number,
): void {
  ctx.lineCap = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
  ctx.beginPath();
  ctx.arc(half, half, radius, -Math.PI * 0.78, -Math.PI * 0.3);
  ctx.stroke();
}

/** Tag hub: the enamel torus — glazed gradient, ink lip, sheen on top. */
export function paintEnamelRing(
  ctx: CanvasRenderingContext2D,
  half: number,
  r: number,
  rawBase: Rgb,
  style: SpriteStyle,
): void {
  const base = saturate(rawBase, 0.45);
  const width = r * 0.42;
  const radius = r * 0.76;
  const grad = ctx.createLinearGradient(
    half - r * 0.8,
    half - r * 0.8,
    half + r * 0.8,
    half + r * 0.8,
  );
  grad.addColorStop(0, rgb(lighten(base, 0.18)));
  grad.addColorStop(1, rgb(darken(base, 0.14)));
  ctx.lineWidth = width;
  ctx.strokeStyle = grad;
  ring(ctx, half, half, radius);

  ctx.lineWidth = Math.max(0.75, r * 0.05);
  ctx.strokeStyle = style.rim;
  ring(ctx, half, half, radius - width * 0.5 + ctx.lineWidth * 0.5);

  paintGlazeSheen(ctx, half, radius + width * 0.2, width * 0.3);
}
