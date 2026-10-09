/**
 * Color math for the graph — one home for "parse any CSS color, then tint it".
 *
 * The node palette is authored in `oklch` (`categorical.ts`), tag overrides may be
 * any hex the console picks, and tokens resolve to whatever the app emits — so a
 * single normalizer (the canvas color parser, which understands all of them) feeds
 * every consumer. `tokens.ts` resolves the theme with it; the sprite materials
 * derive their lit/shadow tones from it. Extracted so the parse exists once.
 *
 * Shading is a plain sRGB mix toward white/black: cheap, predictable, and — since
 * every use is baked into a sprite once — never on a hot path.
 */

export type Rgb = [number, number, number];

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
/** Slate — what an unparseable color falls back to (visible, not alarming). */
const FALLBACK: Rgb = [148, 163, 184];

/** 1×1 probe canvas — parses ANY CSS color by rasterizing one pixel. */
let probe: CanvasRenderingContext2D | null = null;

/**
 * Ground truth for colors the string round-trip can't read (oklch/lab/color()):
 * paint one pixel and sample it. Chromium's `fillStyle` getter preserves modern
 * color syntax verbatim, so regexing the getter alone silently maps every oklch
 * palette entry to the slate fallback — the whole field greys out.
 */
function probePixel(color: string): Rgb {
  if (typeof document === "undefined") return FALLBACK;
  if (!probe) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    probe = canvas.getContext("2d", { willReadFrequently: true });
    if (!probe) return FALLBACK;
  }
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000000"; // guard: invalid input leaves this in place
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const px = probe.getImageData(0, 0, 1, 1).data;
  return [px[0], px[1], px[2]];
}

/** Normalize any CSS color (hex / rgb / hsl / oklch) to [r,g,b] via the canvas parser. */
export function normalizeRgb(ctx: CanvasRenderingContext2D | null, color: string): Rgb {
  let resolved = color;
  if (ctx) {
    ctx.fillStyle = "#000000"; // guard: invalid input leaves this in place
    ctx.fillStyle = color;
    resolved = ctx.fillStyle;
  }
  if (resolved.startsWith("#")) {
    const hex = resolved.slice(1);
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ];
  }
  const match = /rgba?\(([^)]+)\)/.exec(resolved);
  if (match) {
    const parts = match[1].split(",").map((part) => Number.parseInt(part.trim(), 10));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  }
  // Modern syntax (oklch et al) — the getter returned it verbatim; sample a pixel.
  return probePixel(resolved);
}

/** Blend in sRGB: `t` 0 → a, 1 → b. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.min(1, Math.max(0, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

/** Toward white — the lit side of a body, the specular, the rim light. */
export function lighten(color: Rgb, amount: number): Rgb {
  return mix(color, WHITE, amount);
}

/** Toward black — the terminator, the contact shadow, the grounded edge. */
export function darken(color: Rgb, amount: number): Rgb {
  return mix(color, BLACK, amount);
}

/**
 * Away from grey — a chroma lift at constant-ish luminance. The categorical
 * palette is a deliberately calm band (see `categorical.ts`); the materials
 * saturate it locally the way glass and glaze do optically, so nodes read
 * vivid without re-tuning the curated hue set.
 */
export function saturate(color: Rgb, amount: number): Rgb {
  const grey = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
  const k = 1 + Math.max(0, amount);
  const lift = (c: number): number => Math.round(Math.min(255, Math.max(0, grey + (c - grey) * k)));
  return [lift(color[0]), lift(color[1]), lift(color[2])];
}

export function rgb([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Relative luminance (0..1) — picks light vs dark materials from the background. */
export function luminance([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
