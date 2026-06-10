/**
 * Text helpers for the close-zoom card pass: width-bounded ellipsizing with a
 * small memo cache (cards re-render every frame while zoomed in; measuring is
 * the only text cost worth caching at ≤80 cards).
 */

const CACHE_CAP = 1024;
const cache = new Map<string, string>();

export function clearCardTextCache(): void {
  cache.clear();
}

/** Truncate `text` with an ellipsis to fit `maxWidth` at the current ctx.font. */
export function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  // Bucket the width so near-identical zoom levels share cache entries.
  const bucket = Math.round(maxWidth / 4) * 4;
  const key = `${text}|${bucket}|${ctx.font}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let out = text;
  if (ctx.measureText(text).width > maxWidth) {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    out = `${text.slice(0, lo)}…`;
  }
  if (cache.size >= CACHE_CAP) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, out);
  return out;
}
