/**
 * Pre-rendered node sprites — one per unique `shape|color|glyph` key. Baking
 * the backing + body (+ the node's icon glyph) ONCE, then `drawImage` per
 * node, keeps thousands of nodes cheap. LRU-capped: the FAR-zoom pass uses
 * icon-less base keys, so the hot set stays tiny even on huge graphs. Image
 * glyphs land asynchronously: their key is dropped and `onInvalidate` fires so
 * the next frame rebakes with the loaded picture.
 */

import { DISC_FRACTION, SPRITE, paintNode } from "./nodeShapes";
import { type SpriteStyle, parseStyleKey } from "./nodeShape";
import { glyphFromKey } from "./nodeIcon";
import { paintGlyph } from "./spriteIcons";

export { DISC_FRACTION };

const MAX_SPRITES = 384;

export class NodeSpriteCache {
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private style: SpriteStyle = { backing: "rgba(3, 2, 12, 0.66)", mode: "dark" };
  /** Wired by the scene: schedules a repaint when an async glyph image lands. */
  onInvalidate: (() => void) | null = null;

  /** Theme-derived sprite materials; any change rebakes everything. */
  setTheme(style: SpriteStyle): void {
    if (style.backing !== this.style.backing || style.mode !== this.style.mode) {
      this.style = style;
      this.cache.clear();
    }
  }

  clear(): void {
    this.cache.clear();
  }

  /** Sprite for a style key, built + memoized (LRU) on first use. */
  get(key: string): HTMLCanvasElement {
    const hit = this.cache.get(key);
    if (hit) {
      // Map re-insertion keeps recently used keys at the tail (LRU order).
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    if (this.cache.size >= MAX_SPRITES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    const { shape, color, glyph } = parseStyleKey(key);
    const canvas = document.createElement("canvas");
    canvas.width = SPRITE;
    canvas.height = SPRITE;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      paintNode(ctx, shape, color, this.style);
      const resolved = glyph ? glyphFromKey(glyph) : null;
      if (resolved) {
        paintGlyph(ctx, resolved, color, this.style.mode, () => {
          // Rebake this key with the decoded image on the next frame.
          this.cache.delete(key);
          this.onInvalidate?.();
        });
      }
    }
    this.cache.set(key, canvas);
    return canvas;
  }
}
