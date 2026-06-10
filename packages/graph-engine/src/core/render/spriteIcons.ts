/**
 * Paint a resolved glyph into a node sprite. Emoji and monograms draw
 * synchronously (fillText); image glyphs load through a small capped cache and
 * repaint their sprite via the cache's invalidation hook when ready — the
 * monogram stands in until then, so nodes are never blank.
 */

import type { Glyph } from "./nodeIcon";
import type { SpriteMode } from "./nodeShape";
import { SPRITE, DISC_FRACTION } from "./nodeShapes";

const IMAGE_CAP = 128;
const imageCache = new Map<string, HTMLImageElement | "loading" | "failed">();

/** Load (once) an image glyph; `onReady` fires on first successful decode. */
export function loadGlyphImage(url: string, onReady: () => void): HTMLImageElement | null {
  const hit = imageCache.get(url);
  if (hit instanceof HTMLImageElement) return hit;
  if (hit === "loading" || hit === "failed") return null;
  if (imageCache.size >= IMAGE_CAP) {
    const oldest = imageCache.keys().next().value;
    if (oldest !== undefined) imageCache.delete(oldest);
  }
  imageCache.set(url, "loading");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    imageCache.set(url, img);
    onReady();
  };
  img.onerror = () => imageCache.set(url, "failed");
  img.src = url;
  return null;
}

/** Ink color for monogram letters over the node body. */
function monogramInk(color: string, mode: SpriteMode): string {
  // Dark theme: white letter over the colored disc. Light theme ("paper"
  // nodes are white with a colored border): the letter takes the node color.
  return mode === "dark" ? "rgba(255, 255, 255, 0.95)" : color;
}

/** Paint `glyph` centered in a SPRITE×SPRITE node sprite context. */
export function paintGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: Glyph,
  color: string,
  mode: SpriteMode,
  onInvalidate: () => void,
): void {
  const half = SPRITE / 2;
  const r = half * DISC_FRACTION;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (glyph.kind === "image") {
    const img = loadGlyphImage(glyph.ref, onInvalidate);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(half, half, r * 0.78, 0, Math.PI * 2);
      ctx.clip();
      const d = r * 1.56;
      ctx.drawImage(img, half - d / 2, half - d / 2, d, d);
      ctx.restore();
      return;
    }
    // Placeholder monogram while the image loads (or after failure).
    paintLetter(ctx, glyph.ref.slice(0, 1).toUpperCase() || "•", color, mode, half, r);
    return;
  }
  if (glyph.kind === "emoji") {
    ctx.font = `${Math.round(r * 1.35)}px ui-sans-serif, system-ui, sans-serif`;
    // A subtle vertical nudge optically centers most emoji glyphs.
    ctx.fillText(glyph.ref, half, half + r * 0.06);
    return;
  }
  paintLetter(ctx, glyph.ref, color, mode, half, r);
}

function paintLetter(
  ctx: CanvasRenderingContext2D,
  letter: string,
  color: string,
  mode: SpriteMode,
  half: number,
  r: number,
): void {
  ctx.font = `600 ${Math.round(r * 1.3)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = monogramInk(color, mode);
  ctx.fillText(letter, half, half + r * 0.04);
}
