/**
 * Dark material — "aurora glass": an edge-lit smoky glass orb, not a painted ball.
 *
 * Glass reads through its EDGES, not its surface. The interior stays a deep
 * hue-true slab with a faint luminous core (lit from within by the field); all
 * the definition lives on the rim — a tight bloom just OUTSIDE the edge, a
 * Fresnel band that brightens at grazing angles inside it, a crisp near-white
 * key-light arc upper-left and a hue-saturated aurora bounce arc lower-right.
 * One light direction, shared with every material, keeps the scene designed.
 *
 * Baked once per sprite key (see `sprites.ts`) — this depth is free at render
 * time. The bloom is deliberately TIGHT (peaks at the edge, dead by 1.3r): the
 * old full-radius baked halo made every node muddy; an edge bloom reads as
 * emission, not fog, and stays clean at constellation density.
 */

import type { SpriteStyle } from "./nodeShape";
import { type Rgb, darken, lighten, rgb, rgba, saturate } from "../theme/shade";
import { disc, ring } from "./nodeMaterial";

const TAU = Math.PI * 2;
/** Key light direction (upper-left) — matches the old material's light offset. */
const KEY = -Math.PI * 0.73;
/** Aurora bounce — diametrically opposite the key light (lower-right). */
const BOUNCE = Math.PI * 0.27;

/** Stroke a partial arc of the body edge — the edge-light primitive. */
function arcStroke(
  ctx: CanvasRenderingContext2D,
  half: number,
  radius: number,
  center: number,
  span: number,
  width: number,
  style: string,
): void {
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.strokeStyle = style;
  ctx.beginPath();
  ctx.arc(half, half, radius, center - span, center + span);
  ctx.stroke();
}

/** Body of a record/note node: the edge-lit glass orb. */
export function paintGlassBody(
  ctx: CanvasRenderingContext2D,
  half: number,
  r: number,
  base: Rgb,
  style: SpriteStyle,
): void {
  // Glass saturates the light passing through it: lift the calm categorical
  // hue's chroma here (a material property), not in the palette.
  const tone = saturate(base, 0.55);

  // Tight hue bloom outside the edge — the orb faintly lights its own moat.
  // Near-pure hue: whitening here greys the whole field at constellation density.
  const bloom = ctx.createRadialGradient(half, half, r * 0.94, half, half, r * 1.3);
  bloom.addColorStop(0, rgba(lighten(tone, 0.08), 0.22));
  bloom.addColorStop(1, rgba(lighten(tone, 0.08), 0));
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, half * 2, half * 2);

  paintGlassInterior(ctx, half, r, tone);

  // Theme hairline first so the edge lights land ON TOP of it, not under it.
  ctx.lineWidth = Math.max(0.75, r * 0.032);
  ctx.strokeStyle = style.rim;
  ring(ctx, half, half, r - ctx.lineWidth * 0.5);

  paintEdgeLight(ctx, half, r, tone);
}

/** Deep slab + luminous core + Fresnel — the translucent interior. */
function paintGlassInterior(
  ctx: CanvasRenderingContext2D,
  half: number,
  r: number,
  base: Rgb,
): void {
  // Slab: hue-TRUE at the top, sinking into smoked glass at the base. Keep the
  // hue pure — the lift comes from alpha layers, never from mixing toward white
  // (whitened stacks are what turn a colored field into grey steel).
  const slab = ctx.createLinearGradient(0, half - r, 0, half + r);
  slab.addColorStop(0, rgb(base));
  slab.addColorStop(0.55, rgb(darken(base, 0.22)));
  slab.addColorStop(1, rgb(darken(base, 0.48)));
  ctx.fillStyle = slab;
  disc(ctx, half, half, r);

  // Luminous core — the node's own light, seen through the glass.
  const cy = half - r * 0.06;
  const core = ctx.createRadialGradient(half, cy, 0, half, cy, r * 0.9);
  core.addColorStop(0, rgba(lighten(base, 0.1), 0.38));
  core.addColorStop(0.6, rgba(base, 0.1));
  core.addColorStop(1, rgba(base, 0));
  ctx.fillStyle = core;
  disc(ctx, half, half, r);

  // Fresnel: glass SATURATES at grazing angles — a hue-dense rim, not a white one.
  const fresnel = ctx.createRadialGradient(half, half, r * 0.6, half, half, r);
  fresnel.addColorStop(0, rgba(lighten(base, 0.12), 0));
  fresnel.addColorStop(1, rgba(lighten(base, 0.12), 0.55));
  ctx.fillStyle = fresnel;
  disc(ctx, half, half, r);
}

/** Key-light arc, aurora bounce arc, and the glossy specular streak. */
function paintEdgeLight(
  ctx: CanvasRenderingContext2D,
  half: number,
  r: number,
  base: Rgb,
): void {
  const inset = r - r * 0.05;
  // Aurora bounce, lower-right: hue-saturated — soft haze under a bright core.
  arcStroke(ctx, half, inset, BOUNCE, 0.9, r * 0.14, rgba(lighten(base, 0.4), 0.28));
  arcStroke(ctx, half, inset, BOUNCE, 0.6, r * 0.07, rgba(lighten(base, 0.62), 0.85));
  // Key light, upper-left: near-white — the crisp glass signature.
  arcStroke(ctx, half, inset, KEY, 0.95, r * 0.15, "rgba(255, 250, 242, 0.2)");
  arcStroke(ctx, half, inset, KEY, 0.55, r * 0.06, "rgba(255, 251, 244, 0.92)");
  // Specular streak just inside the key arc — gloss, not paint.
  ctx.save();
  ctx.translate(half - r * 0.34, half - r * 0.4);
  ctx.rotate(-Math.PI * 0.23);
  ctx.scale(1, 0.38);
  ctx.fillStyle = "rgba(255, 250, 242, 0.4)";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.16, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Tag hub: the glass torus — graded across the light, with edge catches. */
export function paintGlassRing(
  ctx: CanvasRenderingContext2D,
  half: number,
  r: number,
  rawBase: Rgb,
  _style: SpriteStyle,
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
  grad.addColorStop(0, rgb(lighten(base, 0.34)));
  grad.addColorStop(1, rgb(darken(base, 0.26)));
  ctx.lineWidth = width;
  ctx.strokeStyle = grad;
  ring(ctx, half, half, radius);

  ctx.lineWidth = Math.max(0.75, r * 0.05);
  ctx.strokeStyle = rgba(lighten(base, 0.6), 0.55);
  ring(ctx, half, half, radius - width * 0.5 + ctx.lineWidth * 0.5);

  // Edge catches: key light on the outer shoulder, hue bounce on the inner.
  arcStroke(ctx, half, radius + width * 0.28, KEY, 0.5, width * 0.22, "rgba(255, 251, 244, 0.8)");
  arcStroke(ctx, half, radius - width * 0.3, BOUNCE, 0.55, width * 0.18, rgba(lighten(base, 0.55), 0.6));
}
