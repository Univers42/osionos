/**
 * Pre-rendered node sprites — one per unique `shape|color` (see nodeShape.ts /
 * nodeShapes.ts). Baking the matte backing + flat body + sheen + rim ONCE, then
 * `drawImage` per node, keeps thousands of nodes cheap. Glow is NOT baked here (it
 * is a dynamic emphasis pass), so the cache only depends on shape, color + theme.
 */

import { DISC_FRACTION, SPRITE, paintNode } from "./nodeShapes";
import { parseStyleKey } from "./nodeShape";

export { DISC_FRACTION };

export class NodeSpriteCache {
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private backing = "rgba(3, 2, 12, 0.66)";

  /** The matte-backing color comes from the theme; changing it rebakes sprites. */
  setTheme(backing: string): void {
    if (backing !== this.backing) {
      this.backing = backing;
      this.cache.clear();
    }
  }

  clear(): void {
    this.cache.clear();
  }

  /** Sprite for a `shape|color` style key, built + memoized on first use. */
  get(key: string): HTMLCanvasElement {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const { shape, color } = parseStyleKey(key);
    const canvas = document.createElement("canvas");
    canvas.width = SPRITE;
    canvas.height = SPRITE;
    const ctx = canvas.getContext("2d");
    if (ctx) paintNode(ctx, shape, color, this.backing);
    this.cache.set(key, canvas);
    return canvas;
  }
}
