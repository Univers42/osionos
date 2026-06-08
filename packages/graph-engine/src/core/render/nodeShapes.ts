/**
 * Paint a single node silhouette into a sprite canvas — the "flat constellation"
 * look: a dark matte backing (so the node separates from the aurora at any hue), a
 * flat solid body, a whisper of top sheen and a crisp light rim. Shape encodes the
 * kind: `disc` = record, `ring` = hollow tag hub, `note` = orb with an inner ring.
 * No glow is baked here — emphasis glow is a separate dynamic pass (glowPass.ts).
 */

import type { NodeShape } from "./nodeShape";

export const SPRITE = 128;
/** Body radius as a fraction of the sprite half-size (rest is backing + rim room). */
export const DISC_FRACTION = 0.6;

/** Paint a node of `shape`/`color` centered in a SPRITE×SPRITE context. */
export function paintNode(ctx: CanvasRenderingContext2D, shape: NodeShape, color: string, backing: string): void {
  const half = SPRITE / 2;
  const r = half * DISC_FRACTION;
  paintBacking(ctx, half, r, backing);
  paintBody(ctx, shape, half, r, color);
  if (shape !== "ring") paintSheenRim(ctx, half, r);
}

/** Dark "moat" just larger than the body — the key legibility win. */
function paintBacking(ctx: CanvasRenderingContext2D, half: number, r: number, backing: string): void {
  ctx.fillStyle = backing;
  disc(ctx, half, half, r * 1.12);
}

function paintBody(ctx: CanvasRenderingContext2D, shape: NodeShape, half: number, r: number, color: string): void {
  if (shape === "ring") {
    // Hollow hub: a thick colored ring around the dark backing center.
    ctx.lineWidth = r * 0.42;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(half, half, r * 0.76, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = color;
  disc(ctx, half, half, r);
  if (shape === "note") {
    // Inner light ring marks a note orb (distinct from a plain record disc).
    ctx.lineWidth = r * 0.14;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
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
