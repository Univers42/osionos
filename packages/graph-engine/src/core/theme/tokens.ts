/**
 * Resolve the scene's color theme from the live `--osio-*` design tokens so the
 * graph follows the app's light/dark mode, with aurora-glass defaults. Token
 * colors may be any CSS format (hex/hsl/oklch); we normalize them to rgb via a
 * scratch canvas and apply our own alpha for edges/halo/glow. Theme is resolved
 * on the main thread (DOM access) and handed to the renderer.
 */

import {
  AURORA_BANDS,
  AURORA_BG_BOTTOM,
  AURORA_BG_TOP,
  NOTE_COLOR,
} from "./palette";

export interface SceneTheme {
  /** Aurora background ramp + drifting band colors. */
  bgTop: string;
  bgBottom: string;
  bands: string[];
  edge: string;
  edgeTag: string;
  edgeNote: string;
  edgeHierarchy: string;
  label: string;
  labelHalo: string;
  selectRing: string;
  hoverRing: string;
  noteRing: string;
  /** Neon tint used for node/link glow. */
  glow: string;
  /** Opacity applied to dimmed (out-of-focus) elements. */
  dimAlpha: number;
}

type Rgb = [number, number, number];

export const DARK_THEME: SceneTheme = {
  bgTop: AURORA_BG_TOP,
  bgBottom: AURORA_BG_BOTTOM,
  bands: [...AURORA_BANDS],
  edge: "rgba(148, 163, 184, 0.32)",
  edgeTag: "rgba(148, 163, 184, 0.18)",
  edgeNote: "rgba(245, 191, 96, 0.55)",
  edgeHierarchy: "rgba(245, 191, 96, 0.9)",
  label: "#e7e9f5",
  labelHalo: "rgba(11, 10, 31, 0.85)",
  selectRing: "#a5b4fc",
  hoverRing: "rgba(165, 180, 252, 0.65)",
  noteRing: NOTE_COLOR,
  glow: "rgba(124, 92, 246, 0.9)",
  dimAlpha: 0.1,
};

/** Resolve a theme from `--osio-*` tokens on `root`, falling back to DARK_THEME. */
export function resolveSceneTheme(root: HTMLElement): SceneTheme {
  const scratch = document.createElement("canvas").getContext("2d");
  const styles = getComputedStyle(root);
  const read = (token: string, fallback: string): string => {
    const value = styles.getPropertyValue(token).trim();
    return value || fallback;
  };
  const fg = normalizeRgb(scratch, read("--osio-fg-default", DARK_THEME.label));
  const border = normalizeRgb(scratch, read("--osio-border-strong", "#94a3b8"));
  const accent = normalizeRgb(scratch, read("--osio-accent", "#a5b4fc"));
  const note = normalizeRgb(scratch, NOTE_COLOR);
  const haloBg = normalizeRgb(scratch, read("--osio-graph-bg-1", AURORA_BG_BOTTOM));
  const bands = [1, 2, 3, 4].map((i, idx) =>
    read(`--osio-graph-aurora-${i}`, AURORA_BANDS[idx]),
  );

  return {
    bgTop: read("--osio-graph-bg-0", AURORA_BG_TOP),
    bgBottom: read("--osio-graph-bg-1", AURORA_BG_BOTTOM),
    bands,
    edge: rgba(border, 0.32),
    edgeTag: rgba(border, 0.18),
    edgeNote: rgba(note, 0.55),
    edgeHierarchy: rgba(note, 0.9),
    label: rgb(fg),
    labelHalo: rgba(haloBg, 0.85),
    selectRing: rgb(accent),
    hoverRing: rgba(accent, 0.65),
    noteRing: rgb(note),
    glow: rgba(accent, 0.9),
    dimAlpha: 0.1,
  };
}

function rgb([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Normalize any CSS color string to [r,g,b] via the canvas color parser. */
function normalizeRgb(ctx: CanvasRenderingContext2D | null, color: string): Rgb {
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
  return [148, 163, 184];
}
