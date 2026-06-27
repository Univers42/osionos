/**
 * "Warm Constellation" background on its own canvas + slow rAF loop, decoupled
 * from the graph's dirty-driven draw loop (so the graph still idles for free while
 * the field gently breathes). A warm vertical ramp (cream→parchment / charcoal→
 * warm-black) under a baked paper-grain tile, with ONE soft warm center bloom and
 * a warm vignette. Reduced-motion / "flat" → painted once, no loop. All bakes
 * (grain) happen only on setSize / setTheme — never per frame.
 */

import type { SceneTheme } from "../theme/tokens";
import type { BackgroundStyle } from "../state/controls";
import { bakeGrainTile } from "./grain";

// The field drifts imperceptibly slowly (a full cycle is ~26 min), so redraw the
// expensive full-screen fills at ~12fps, not 60 — they were saturating the main
// thread and starving the graph's own loop (the dominant cost at high DPR).
const BG_FRAME_MS = 80;

export class AuroraBackground {
  private readonly ctx: CanvasRenderingContext2D | null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private raf: number | null = null;
  private style: BackgroundStyle = "aurora";
  private grain: CanvasPattern | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private theme: SceneTheme,
    private reducedMotion: boolean,
  ) {
    this.ctx = canvas.getContext("2d");
    this.refreshGrain();
  }

  setSize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    // Soft field — render at 1x; low resolution is imperceptible (the grain hides any
    // gradient banding) and a quarter of the pixel cost of a 2x retina backing.
    this.dpr = Math.min(dpr, 1);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.draw(performance.now());
  }

  setTheme(theme: SceneTheme): void {
    this.theme = theme;
    this.refreshGrain();
    this.draw(performance.now());
  }

  setStyle(style: BackgroundStyle): void {
    this.style = style;
    if (style === "flat" || this.reducedMotion) this.stop();
    else this.start();
    this.draw(performance.now());
  }

  start(): void {
    if (this.raf != null || this.reducedMotion || this.style === "flat") return;
    let last = 0;
    const loop = (now: number): void => {
      if (now - last >= BG_FRAME_MS) { last = now; this.draw(now); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf != null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
  }

  destroy(): void {
    this.stop();
  }

  /** Bake the paper-grain tile once (on construct + every theme change). */
  private refreshGrain(): void {
    const tile = bakeGrainTile(this.theme.grain);
    this.grain = tile && this.ctx ? this.ctx.createPattern(tile, "repeat") : null;
  }

  private draw(now: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const ramp = ctx.createLinearGradient(0, 0, 0, this.height);
    ramp.addColorStop(0, this.theme.bgTop);
    ramp.addColorStop(1, this.theme.bgBottom);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = ramp;
    ctx.fillRect(0, 0, this.width, this.height);

    // Paper grain — a tiled, baked speck pattern (no per-frame cost beyond one fill).
    if (this.grain) {
      ctx.fillStyle = this.grain;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (this.style !== "flat") {
      // ONE soft warm bloom — light = `multiply` (no-op `screen` on cream), warm-dark
      // = `screen` ember. Gently drifts so the field breathes; the data still leads.
      const light = this.theme.mode === "light";
      const drift = this.style === "aurora-calm" ? 0.45 : 1;
      const t = this.reducedMotion ? 0 : now * 0.00004 * drift;
      const cx = (0.5 + Math.sin(t) * 0.04) * this.width;
      const cy = (0.46 + Math.cos(t * 0.8) * 0.04) * this.height;
      const r = Math.max(this.width, this.height) * 0.6;
      const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      bloom.addColorStop(0, this.theme.field);
      bloom.addColorStop(1, "transparent");
      ctx.globalCompositeOperation = light ? "multiply" : "screen";
      ctx.globalAlpha = this.style === "aurora-calm" ? 0.7 : 1;
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // Vignette: darken the edges so the graph centers the eye and the console
    // glass separates from the field.
    const vx = this.width / 2;
    const vy = this.height / 2;
    const vr = Math.max(this.width, this.height) * 0.75;
    const vignette = ctx.createRadialGradient(vx, vy, vr * 0.35, vx, vy, vr);
    vignette.addColorStop(0, "transparent");
    vignette.addColorStop(1, this.theme.vignette);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
  }
}
