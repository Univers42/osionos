/**
 * Pre-baked label bitmaps. The old path drew every label with two
 * shadow-blurred fillText calls PER FRAME — the single biggest frame cost at
 * scale (shadowBlur text is ~1ms each; 480 labels ≈ half a second). Here each
 * unique label bakes once (halo included) into a small canvas at the device
 * pixel ratio, and frames just drawImage. LRU-capped above the label budget.
 */

const FONT = "12px ui-sans-serif, system-ui, sans-serif";
const PAD = 8;
const HEIGHT = 20;
const MAX_LABELS = 700;
/** New bakes allowed per frame — prevents cache-thrash during pan/zoom (a
 *  moving viewport over 10k distinct labels would otherwise bake dozens of
 *  shadowBlur canvases EVERY frame; skipped labels appear within a few frames). */
const BAKES_PER_FRAME = 6;

export class LabelCache {
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private color = "#e7e9f5";
  private halo = "rgba(11, 10, 31, 0.85)";
  private dpr = 1;
  private bakeBudget = BAKES_PER_FRAME;

  setTheme(color: string, halo: string, dpr: number): void {
    if (color !== this.color || halo !== this.halo || dpr !== this.dpr) {
      this.color = color;
      this.halo = halo;
      this.dpr = Math.max(1, dpr);
      this.cache.clear();
    }
  }

  clear(): void {
    this.cache.clear();
  }

  /** Reset the per-frame bake budget (called once per rendered frame). */
  beginFrame(): void {
    this.bakeBudget = BAKES_PER_FRAME;
  }

  /** Blit the baked label at screen (x, y-center); bakes on first miss
   *  (budgeted per frame — over-budget misses simply skip this frame). */
  draw(ctx: CanvasRenderingContext2D, text: string, accent: boolean, x: number, y: number, alpha: number): void {
    const key = `${accent ? 1 : 0}|${text}`;
    let sprite = this.cache.get(key);
    if (!sprite) {
      if (this.bakeBudget <= 0) return;
      this.bakeBudget -= 1;
      sprite = this.bake(text, accent);
      if (this.cache.size >= MAX_LABELS) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      this.cache.set(key, sprite);
    } else {
      this.cache.delete(key);
      this.cache.set(key, sprite);
    }
    ctx.globalAlpha = alpha;
    // The bake pads PAD px around the text; offset so the text starts at `x`.
    ctx.drawImage(sprite, x - PAD, y - HEIGHT / 2, sprite.width / this.dpr, HEIGHT);
    ctx.globalAlpha = 1;
  }

  private bake(text: string, accent: boolean): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    const measure = canvas.getContext("2d");
    const font = `${accent ? "600 " : ""}${FONT}`;
    let width = 80;
    if (measure) {
      measure.font = font;
      width = Math.ceil(measure.measureText(text).width) + PAD * 2;
    }
    canvas.width = Math.max(1, Math.round(width * this.dpr));
    canvas.height = Math.round(HEIGHT * this.dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.scale(this.dpr, this.dpr);
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.shadowColor = this.halo;
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = this.color;
    // Two passes deepen the halo for contrast (same look as the old per-frame path).
    ctx.fillText(text, PAD, HEIGHT / 2);
    ctx.fillText(text, PAD, HEIGHT / 2);
    return canvas;
  }
}
