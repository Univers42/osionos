/**
 * Resolve the scene's color theme from the live `--osio-*` design tokens so the
 * graph follows the app's light/dark mode, with aurora-glass defaults. Token
 * colors may be any CSS format (hex/hsl/oklch); we normalize them to rgb via a
 * scratch canvas and apply our own alpha for edges/halo/glow. Theme is resolved
 * on the main thread (DOM access) and handed to the renderer.
 */

import type { SpriteMode } from "../render/nodeShape";
import {
  AURORA_BANDS,
  AURORA_BG_BOTTOM,
  AURORA_BG_TOP,
  NODE_BACKING,
  NOTE_COLOR,
} from "./palette";

export interface SceneTheme {
  /** "light" (cream paper) or "dark" (warm ember) — derived from the bg luminance. */
  mode: SpriteMode;
  /** Background ramp + (warm) field band colors. */
  bgTop: string;
  bgBottom: string;
  bands: string[];
  /** Soft warm center bloom over the ramp. */
  field: string;
  /** Warm tonal edge darkening. */
  vignette: string;
  /** Baked paper-grain speck color. */
  grain: string;
  edge: string;
  edgeTag: string;
  edgeNote: string;
  edgeHierarchy: string;
  label: string;
  labelHalo: string;
  selectRing: string;
  hoverRing: string;
  noteRing: string;
  /** Warm thread drawn along a focused node's edges (a "thread of attention"). */
  focusThread: string;
  /** Tint used for node/link glow (dark only — light skips additive bloom). */
  glow: string;
  /** "Moat" painted under each node sprite for legibility on the backdrop. */
  nodeBacking: string;
  /** Hairline rim + soft drop shadow baked into the node sprite. */
  nodeRim: string;
  nodeShadow: string;
  /** Close-zoom card materials. */
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
  cardTitle: string;
  cardMuted: string;
  /** Opacity applied to dimmed (out-of-focus) elements. */
  dimAlpha: number;
}

type Rgb = [number, number, number];

export const DARK_THEME: SceneTheme = {
  mode: "dark",
  bgTop: AURORA_BG_TOP,
  bgBottom: AURORA_BG_BOTTOM,
  bands: [...AURORA_BANDS],
  field: "rgba(224, 147, 122, 0.1)",
  vignette: "rgba(0, 0, 0, 0.4)",
  grain: "rgba(255, 240, 210, 0.025)",
  edge: "rgba(168, 163, 153, 0.26)",
  edgeTag: "rgba(217, 184, 156, 0.16)",
  edgeNote: "rgba(224, 147, 122, 0.55)",
  edgeHierarchy: "rgba(217, 184, 156, 0.78)",
  label: "#edeae3",
  labelHalo: "rgba(21, 20, 15, 0.85)",
  selectRing: "#e0937a",
  hoverRing: "rgba(224, 147, 122, 0.55)",
  noteRing: NOTE_COLOR,
  focusThread: "rgba(224, 147, 122, 0.85)",
  glow: "rgba(224, 147, 122, 0.9)",
  nodeBacking: NODE_BACKING,
  nodeRim: "rgba(255, 244, 228, 0.16)",
  nodeShadow: "rgba(0, 0, 0, 0.45)",
  cardBg: "#242120",
  cardBorder: "#353029",
  cardShadow: "rgba(0, 0, 0, 0.55)",
  cardTitle: "#edeae3",
  cardMuted: "#a8a399",
  dimAlpha: 0.12,
};

/** Resolve a theme from `--osio-*` tokens on `root`, falling back to DARK_THEME. */
export function resolveSceneTheme(root: HTMLElement): SceneTheme {
  const scratch = document.createElement("canvas").getContext("2d");
  const styles = getComputedStyle(root);
  const read = (token: string, fallback: string): string => {
    const value = styles.getPropertyValue(token).trim();
    return value || fallback;
  };
  const ink = normalizeRgb(
    scratch,
    read("--osio-graph-ink", read("--osio-fg-default", DARK_THEME.label)),
  );
  const note = normalizeRgb(scratch, read("--osio-graph-note", NOTE_COLOR));
  const sel = normalizeRgb(scratch, read("--osio-graph-select", "#cc785c"));
  const bgBottom = read("--osio-graph-bg-1", AURORA_BG_BOTTOM);
  const bgRgb = normalizeRgb(scratch, bgBottom);
  const mode: SpriteMode = luminance(bgRgb) > 0.5 ? "light" : "dark";
  const bands = [1, 2, 3, 4].map((i, idx) =>
    read(`--osio-graph-aurora-${i}`, AURORA_BANDS[idx]),
  );

  return {
    mode,
    bgTop: read("--osio-graph-bg-0", AURORA_BG_TOP),
    bgBottom,
    bands,
    field: read("--osio-graph-field-warm", DARK_THEME.field),
    vignette: read("--osio-graph-vignette", DARK_THEME.vignette),
    grain: read("--osio-graph-grain", DARK_THEME.grain),
    edge: read("--osio-graph-edge", DARK_THEME.edge),
    edgeTag: read("--osio-graph-edge-tag", DARK_THEME.edgeTag),
    edgeNote: read("--osio-graph-edge-note", DARK_THEME.edgeNote),
    edgeHierarchy: read("--osio-graph-edge-hier", DARK_THEME.edgeHierarchy),
    label: rgb(ink),
    labelHalo: read("--osio-graph-halo", rgba(bgRgb, 0.85)),
    selectRing: read("--osio-graph-select", rgb(sel)),
    hoverRing: read("--osio-graph-hover", rgba(sel, 0.55)),
    noteRing: read("--osio-graph-note", rgb(note)),
    focusThread: read("--osio-graph-focus-thread", rgba(sel, 0.85)),
    glow: rgba(sel, 0.9),
    nodeBacking: read("--osio-graph-node-backing", NODE_BACKING),
    nodeRim: read("--osio-graph-node-rim", DARK_THEME.nodeRim),
    nodeShadow: read("--osio-graph-node-shadow", DARK_THEME.nodeShadow),
    cardBg: read("--osio-graph-card-bg", DARK_THEME.cardBg),
    cardBorder: read("--osio-graph-card-border", DARK_THEME.cardBorder),
    cardShadow: read("--osio-graph-card-shadow", DARK_THEME.cardShadow),
    cardTitle: rgb(ink),
    cardMuted: read("--osio-graph-ink-muted", rgba(ink, 0.62)),
    dimAlpha: 0.12,
  };
}

/** Relative luminance (0..1) of an sRGB color — picks light vs dark materials. */
function luminance([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
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
