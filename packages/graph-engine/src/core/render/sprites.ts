/**
 * Pre-rendered "glassy orb" sprites — one per unique node color. Baking the glow
 * (via shadowBlur), the highlight sheen and the rim shade ONCE, then `drawImage`
 * per node, keeps thousands of nodes cheap while looking far richer than a flat
 * disc. Color manipulation is avoided entirely: highlight/shade are white/black
 * overlays, so any CSS color (hex/rgb/oklch) works.
 */

const SPRITE = 128;
/** Disc radius as a fraction of the sprite half-size (rest is glow padding). */
export const DISC_FRACTION = 0.46;

export class NodeSpriteCache {
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private glow: number;

  constructor(glow = 1) {
    this.glow = glow;
  }

  setGlow(glow: number): void {
    if (glow !== this.glow) {
      this.glow = glow;
      this.cache.clear();
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get(color: string): HTMLCanvasElement {
    const hit = this.cache.get(color);
    if (hit) return hit;
    const sprite = this.build(color);
    this.cache.set(color, sprite);
    return sprite;
  }

  private build(color: string): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = SPRITE;
    canvas.height = SPRITE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    const half = SPRITE / 2;
    const rDisc = half * DISC_FRACTION;

    // Baked glow halo.
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = half * 0.55 * Math.min(1.5, Math.max(0, this.glow));
    ctx.globalAlpha = Math.min(1, 0.55 + this.glow * 0.3);
    ctx.fillStyle = color;
    disc(ctx, half, half, rDisc);
    ctx.restore();

    // Solid body.
    ctx.fillStyle = color;
    disc(ctx, half, half, rDisc);

    // Glassy highlight (top-left) + rim shade (bottom) — white/black only.
    const hx = half - rDisc * 0.32;
    const hy = half - rDisc * 0.4;
    const sheen = ctx.createRadialGradient(hx, hy, 1, hx, hy, rDisc * 1.2);
    sheen.addColorStop(0, "rgba(255,255,255,0.6)");
    sheen.addColorStop(0.45, "rgba(255,255,255,0.08)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    disc(ctx, half, half, rDisc);

    const rim = ctx.createRadialGradient(half, half, rDisc * 0.55, half, half, rDisc);
    rim.addColorStop(0, "rgba(0,0,0,0)");
    rim.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = rim;
    disc(ctx, half, half, rDisc);

    return canvas;
  }
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
