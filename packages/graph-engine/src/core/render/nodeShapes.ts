/**
 * Paint a single node silhouette into a sprite canvas — the "Warm Constellation"
 * material. Two material sets share one shape language (disc = record, ring = tag
 * hub, note = ringed orb):
 * - light "seed in paper": a white sheet with a baked warm drop shadow, a faint
 *   colored tint, and a two-stroke rim (warm-ink hairline + a colored identity
 *   band just inside) — crisp ink-on-cream reading, no glow;
 * - dark "ember stone": a matte warm backing, a vibrant color body, a warm-tinted
 *   sheen and a warm rim — depth without gloss (glowPass adds the live bloom).
 * All material colors flow from the theme (`style.rim`/`style.shadow`/`style.backing`).
 */

import type { NodeShape, SpriteStyle } from "./nodeShape";

export const SPRITE = 128;
/** Body radius as a fraction of the sprite half-size (rest is backing + rim room). */
export const DISC_FRACTION = 0.6;

/** Paint a node of `shape`/`color` centered in a SPRITE×SPRITE context. */
export function paintNode(ctx: CanvasRenderingContext2D, shape: NodeShape, color: string, style: SpriteStyle): void {
  const half = SPRITE / 2;
  const r = half * DISC_FRACTION;
  paintBacking(ctx, half, r, style);
  paintBody(ctx, shape, half, r, color, style);
  if (shape !== "ring" && style.mode === "dark") paintRim(ctx, half, r, style);
}

/** The "moat" just larger than the body — the key legibility win on any backdrop. */
function paintBacking(ctx: CanvasRenderingContext2D, half: number, r: number, style: SpriteStyle): void {
  if (style.mode === "light") {
    // White sheet + baked warm drop shadow — the soft lift that replaces glow on cream.
    ctx.save();
    ctx.shadowColor = style.shadow;
    ctx.shadowBlur = 7;
    ctx.shadowOffsetY = 2.5;
    ctx.fillStyle = style.backing;
    disc(ctx, half, half, r * 1.12);
    ctx.restore();
    return;
  }
  ctx.fillStyle = style.backing;
  disc(ctx, half, half, r * 1.12);
}

function paintBody(
  ctx: CanvasRenderingContext2D,
  shape: NodeShape,
  half: number,
  r: number,
  color: string,
  style: SpriteStyle,
): void {
  const light = style.mode === "light";
  if (shape === "ring") {
    // Hollow hub: a thick colored ring around the backing center.
    ctx.lineWidth = r * 0.42;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(half, half, r * 0.76, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (light) {
    // Paper body: white sheet, faint inner color tint, then a two-stroke rim —
    // a warm-ink hairline on the outside with the colored identity band just within.
    ctx.fillStyle = "#ffffff";
    disc(ctx, half, half, r);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = color;
    disc(ctx, half, half, r);
    ctx.globalAlpha = 1;
    const inkW = r * 0.06;
    ctx.lineWidth = inkW;
    ctx.strokeStyle = style.rim;
    ctx.beginPath();
    ctx.arc(half, half, r - inkW * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    const bandW = r * 0.14;
    ctx.lineWidth = bandW;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(half, half, r - inkW - bandW * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    disc(ctx, half, half, r);
  }
  if (shape === "note") {
    // Inner ring marks a note orb (distinct from a plain record disc).
    ctx.lineWidth = r * 0.14;
    ctx.strokeStyle = light ? color : "rgba(255, 244, 228, 0.72)";
    ctx.beginPath();
    ctx.arc(half, half, r * 0.52, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Warm top-left sheen (≤0.12) + a warm rim — dimension without gloss (dark only). */
function paintRim(ctx: CanvasRenderingContext2D, half: number, r: number, style: SpriteStyle): void {
  const hx = half - r * 0.3;
  const hy = half - r * 0.38;
  const sheen = ctx.createRadialGradient(hx, hy, 1, hx, hy, r * 1.05);
  sheen.addColorStop(0, "rgba(255, 244, 228, 0.12)");
  sheen.addColorStop(0.6, "rgba(255, 244, 228, 0.03)");
  sheen.addColorStop(1, "rgba(255, 244, 228, 0)");
  ctx.fillStyle = sheen;
  disc(ctx, half, half, r);

  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.strokeStyle = style.rim;
  ctx.beginPath();
  ctx.arc(half, half, r - ctx.lineWidth * 0.5, 0, Math.PI * 2);
  ctx.stroke();
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
