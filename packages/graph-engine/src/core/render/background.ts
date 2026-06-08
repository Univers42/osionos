/**
 * Aurora-glass background on its own canvas + slow rAF loop, decoupled from the
 * graph's dirty-driven draw loop (so the graph still idles for free while the
 * aurora drifts). A deep indigo→violet vertical ramp with a few large, slowly
 * moving radial "bands" composited additively. Reduced-motion / "flat" → painted
 * once, no loop.
 */

import type { SceneTheme } from "../theme/tokens";
import type { BackgroundStyle } from "../state/controls";

interface BandSpec {
  hx: number;
  hy: number;
  rx: number;
  ry: number;
  speed: number;
  phase: number;
}

const BANDS: BandSpec[] = [
  { hx: 0.28, hy: 0.22, rx: 0.18, ry: 0.12, speed: 0.00006, phase: 0 },
  { hx: 0.72, hy: 0.32, rx: 0.16, ry: 0.16, speed: 0.00009, phase: 2.1 },
  { hx: 0.5, hy: 0.78, rx: 0.2, ry: 0.14, speed: 0.00007, phase: 4.2 },
  { hx: 0.82, hy: 0.7, rx: 0.14, ry: 0.1, speed: 0.00011, phase: 1.2 },
];

export class AuroraBackground {
  private readonly ctx: CanvasRenderingContext2D | null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private raf: number | null = null;
  private style: BackgroundStyle = "aurora";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private theme: SceneTheme,
    private reducedMotion: boolean,
  ) {
    this.ctx = canvas.getContext("2d");
  }

  setSize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(dpr, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.draw(performance.now());
  }

  setTheme(theme: SceneTheme): void {
    this.theme = theme;
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
    const loop = (now: number): void => {
      this.draw(now);
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

    if (this.style !== "flat") {
      const drift = this.style === "aurora-calm" ? 0.45 : 1;
      // Calmer than before (was 0.2): the data should lead, not the bands.
      const intensity = this.style === "aurora-calm" ? 0.1 : 0.14;
      ctx.globalCompositeOperation = "screen";
      BANDS.forEach((band, i) => {
        const t = this.reducedMotion ? 0 : now * band.speed * drift;
        const cx = (band.hx + Math.sin(t + band.phase) * 0.06) * this.width;
        const cy = (band.hy + Math.cos(t * 0.8 + band.phase) * 0.05) * this.height;
        const r = Math.max(this.width, this.height) * (band.rx + band.ry);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, this.theme.bands[i % this.theme.bands.length]);
        grad.addColorStop(1, "transparent");
        ctx.globalAlpha = intensity;
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.width, this.height);
      });
    }

    // Vignette: darken the edges so the graph centers the eye and the console
    // glass separates from the field.
    const vx = this.width / 2;
    const vy = this.height / 2;
    const vr = Math.max(this.width, this.height) * 0.75;
    const vignette = ctx.createRadialGradient(vx, vy, vr * 0.35, vx, vy, vr);
    vignette.addColorStop(0, "transparent");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.4)");
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
  }
}
