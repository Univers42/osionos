/**
 * Paint a single node silhouette into a sprite canvas. Two material sets share
 * one shape language (disc = record, ring = tag hub, note = ringed orb):
 * - dark "flat constellation": dark matte backing, flat colored body, whisper
 *   of top sheen and a crisp light rim — no baked glow (glowPass is dynamic);
 * - light "paper": soft white moat with a baked drop shadow, white body with a
 *   colored border + faint inner tint, no sheen — crisp ink-on-paper reading.
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
  if (shape !== "ring" && style.mode === "dark") paintSheenRim(ctx, half, r);
}

/** The "moat" just larger than the body — the key legibility win on any backdrop. */
function paintBacking(ctx: CanvasRenderingContext2D, half: number, r: number, style: SpriteStyle): void {
  if (style.mode === "light") {
    ctx.save();
    ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
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
    // Paper body: white fill, colored border, faint inner tint of the color.
    ctx.fillStyle = "#ffffff";
    disc(ctx, half, half, r);
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = color;
    disc(ctx, half, half, r);
    ctx.globalAlpha = 1;
    ctx.lineWidth = r * 0.18;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(half, half, r - ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    disc(ctx, half, half, r);
  }
  if (shape === "note") {
    // Inner ring marks a note orb (distinct from a plain record disc).
    ctx.lineWidth = r * 0.14;
    ctx.strokeStyle = light ? color : "rgba(255, 255, 255, 0.72)";
    ctx.beginPath();
    ctx.arc(half, half, r * 0.52, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Subtle top-left sheen (≤0.14) + a crisp light rim — dimension without gloss. */
function paintSheenRim(ctx: CanvasRenderingContext2D, half: number, r: number): void {
  const hx = half - r * 0.3;
  const hy = half - r * 0.38;
  const sheen = ctx.createRadialGradient(hx, hy, 1, hx, hy, r * 1.05);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.14)");
  sheen.addColorStop(0.6, "rgba(255, 255, 255, 0.03)");
  sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = sheen;
  disc(ctx, half, half, r);

  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.beginPath();
  ctx.arc(half, half, r - ctx.lineWidth * 0.5, 0, Math.PI * 2);
  ctx.stroke();
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
