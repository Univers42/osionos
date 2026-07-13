/**
 * "Warm Constellation" field — the atmosphere the graph sits in. Its own canvas +
 * a slow rAF loop, decoupled from the graph's dirty-driven draw (so the graph still
 * idles for free while the field breathes).
 *
 * Composition, back to front:
 *   1. a vertical ramp (cream→parchment / charcoal→warm-black)
 *   2. a broad centre LIFT — the field reads as a lit space, not a painted wall
 *   3. paper grain (also the thing that hides gradient banding at 1x)
 *   4. three drifting AURORA bands — the palette's own `--osio-graph-aurora-*` hues,
 *      squashed into slow ellipses on independent orbits
 *   5. a vignette that closes the edges so the eye lands on the data
 *
 * PERF — the reason this is affordable: 1–3 never change between frames, so they are
 * BAKED into an offscreen backdrop on setSize/setTheme and blitted with one drawImage.
 * Only the aurora (bounded to each band's own bbox, never full-screen) and the vignette
 * are per-frame. That is strictly LESS per-frame work than the old version, which
 * re-filled the ramp + grain + bloom + vignette full-screen every tick and was starving
 * the graph's loop — and it buys a far richer field.
 *
 * The data always leads: band alphas are deliberately low, and `reducedMotion`/`flat`
 * freeze the drift (the aurora still renders — it just stops moving).
 */

import type { SceneTheme } from "../theme/tokens";
import type { BackgroundStyle } from "../state/controls";
import { bakeGrainTile } from "./grain";

// The field drifts imperceptibly slowly (a full cycle is ~26 min), so redraw at ~12fps.
const BG_FRAME_MS = 80;

/** Three bands on independent orbits — placed, not random, so the field stays composed. */
const BANDS = [
  { x: 0.3, y: 0.32, r: 0.62, squash: 0.72, speed: 1, phase: 0, alpha: 0.16 },
  { x: 0.72, y: 0.4, r: 0.55, squash: 0.62, speed: -0.7, phase: 2.1, alpha: 0.13 },
  { x: 0.52, y: 0.74, r: 0.68, squash: 0.55, speed: 0.55, phase: 4.2, alpha: 0.11 },
] as const;

export class AuroraBackground {
  private readonly ctx: CanvasRenderingContext2D | null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private raf: number | null = null;
  private style: BackgroundStyle = "aurora";
  private grain: CanvasPattern | null = null;
  /** Baked ramp + lift + grain — everything that does not move. */
  private backdrop: HTMLCanvasElement | null = null;

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
    this.bakeBackdrop();
    this.draw(performance.now());
  }

  setTheme(theme: SceneTheme): void {
    this.theme = theme;
    this.refreshGrain();
    this.bakeBackdrop();
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
      if (now - last >= BG_FRAME_MS) {
        last = now;
        this.draw(now);
      }
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
    this.backdrop = null;
  }

  /** Bake the paper-grain tile once (on construct + every theme change). */
  private refreshGrain(): void {
    const tile = bakeGrainTile(this.theme.grain);
    this.grain = tile && this.ctx ? this.ctx.createPattern(tile, "repeat") : null;
  }

  /** Ramp + centre lift + grain → one bitmap. Re-baked only on resize / theme change. */
  private bakeBackdrop(): void {
    if (this.width <= 0 || this.height <= 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(this.width * this.dpr));
    canvas.height = Math.max(1, Math.round(this.height * this.dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const ramp = ctx.createLinearGradient(0, 0, 0, this.height);
    ramp.addColorStop(0, this.theme.bgTop);
    ramp.addColorStop(1, this.theme.bgBottom);
    ctx.fillStyle = ramp;
    ctx.fillRect(0, 0, this.width, this.height);

    // Centre lift: the field opens up where the graph lives.
    const cx = this.width * 0.5;
    const cy = this.height * 0.46;
    const lr = Math.max(this.width, this.height) * 0.72;
    const lift = ctx.createRadialGradient(cx, cy, 0, cx, cy, lr);
    lift.addColorStop(0, this.theme.field);
    lift.addColorStop(1, "transparent");
    ctx.globalCompositeOperation = this.theme.mode === "light" ? "multiply" : "screen";
    ctx.fillStyle = lift;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = "source-over";

    if (this.grain) {
      ctx.fillStyle = this.grain;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    this.backdrop = canvas;
  }

  private draw(now: number): void {
    const ctx = this.ctx;
    if (!ctx || this.width <= 0) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    if (this.backdrop) {
      ctx.drawImage(this.backdrop, 0, 0, this.width, this.height);
    } else {
      ctx.fillStyle = this.theme.bgBottom;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (this.style !== "flat") {
      const calm = this.style === "aurora-calm";
      const t = this.reducedMotion ? 0 : now * 0.00004 * (calm ? 0.45 : 1);
      const gain = calm ? 0.65 : 1;
      for (let i = 0; i < BANDS.length; i += 1) this.drawBand(ctx, i, t, gain);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    // Vignette: close the edges so the graph centers the eye and the console glass
    // separates from the field. Drawn last so the aurora can't wash the corners out.
    const vx = this.width / 2;
    const vy = this.height / 2;
    const vr = Math.max(this.width, this.height) * 0.75;
    const vignette = ctx.createRadialGradient(vx, vy, vr * 0.35, vx, vy, vr);
    vignette.addColorStop(0, "transparent");
    vignette.addColorStop(1, this.theme.vignette);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
  }

  /** One drifting elliptical wash, filled over its OWN bbox — never full-screen. */
  private drawBand(ctx: CanvasRenderingContext2D, index: number, t: number, gain: number): void {
    const band = BANDS[index];
    const color = this.theme.bands[index % this.theme.bands.length];
    if (!color) return;
    const cx = (band.x + Math.sin(t * band.speed + band.phase) * 0.05) * this.width;
    const cy = (band.y + Math.cos(t * band.speed * 0.8 + band.phase) * 0.04) * this.height;
    const r = Math.max(this.width, this.height) * band.r;

    ctx.save();
    // screen on the ember field (light blooms), multiply on cream (a wash would blow out).
    ctx.globalCompositeOperation = this.theme.mode === "light" ? "multiply" : "screen";
    ctx.globalAlpha = band.alpha * gain;
    ctx.translate(cx, cy);
    ctx.scale(1, band.squash); // squashed into an ellipse — organic, not a bullseye
    const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    wash.addColorStop(0, color);
    wash.addColorStop(1, "transparent");
    ctx.fillStyle = wash;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
}
