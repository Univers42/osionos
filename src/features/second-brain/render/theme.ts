/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   theme.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { EdgeKind, GraphNode } from "../model/graphModel";
import { NOTE_COLOR, TAG_COLOR, databaseColor } from "../model/palette";

/**
 * Canvas color tokens (doc 05 owns the full visual system; Phase 1 ships a
 * legible default). Colors are concrete CSS color strings so the 2D context can
 * parse them directly. The full `--osio-*` token wiring lands in doc 05.
 */

export interface SceneTheme {
  background: string;
  edge: string;
  edgeTag: string;
  edgeNote: string;
  edgeHierarchy: string;
  label: string;
  labelHalo: string;
  selectRing: string;
  hoverRing: string;
  noteRing: string;
  /** Opacity applied to dimmed (out-of-focus) elements. */
  dimAlpha: number;
}

export const DARK_THEME: SceneTheme = {
  background: "#0f1115",
  edge: "rgba(148, 163, 184, 0.28)",
  edgeTag: "rgba(148, 163, 184, 0.18)",
  edgeNote: "rgba(245, 191, 96, 0.5)",
  edgeHierarchy: "rgba(245, 191, 96, 0.85)",
  label: "#e5e9f0",
  labelHalo: "rgba(15, 17, 21, 0.85)",
  selectRing: "#60a5fa",
  hoverRing: "rgba(96, 165, 250, 0.6)",
  noteRing: NOTE_COLOR,
  dimAlpha: 0.12,
};

/** Resolve the fill color for a node from its kind/database. */
export function nodeFill(node: GraphNode): string {
  if (node.kind === "note") return NOTE_COLOR;
  if (node.kind === "tag") return TAG_COLOR;
  return databaseColor(node.databaseId ?? node.source);
}

/** Edge stroke color by kind. */
export function edgeStroke(theme: SceneTheme, kind: EdgeKind): string {
  if (kind === "tag") return theme.edgeTag;
  if (kind === "hierarchy") return theme.edgeHierarchy;
  if (kind === "note_of" || kind === "note_link") return theme.edgeNote;
  return theme.edge;
}

/**
 * Resolve a theme from the live `--osio-*` design tokens on `root`, so the graph
 * follows the app's light/dark mode (doc 05 principle 5). Token colors may be in
 * any CSS format (hex/hsl/oklch); we normalize them to rgb via a scratch canvas
 * and apply our own alpha for edges/halo. Falls back to `DARK_THEME` values.
 */
export function resolveSceneTheme(root: HTMLElement): SceneTheme {
  const scratch = document.createElement("canvas").getContext("2d");
  const styles = getComputedStyle(root);
  const read = (token: string, fallback: string): string => {
    const value = styles.getPropertyValue(token).trim();
    return value || fallback;
  };
  const bg = normalizeRgb(scratch, read("--osio-bg-page", "#0f1115"));
  const fg = normalizeRgb(scratch, read("--osio-fg-default", "#e5e9f0"));
  const border = normalizeRgb(scratch, read("--osio-border-strong", "#94a3b8"));
  const accent = normalizeRgb(scratch, read("--osio-accent", "#60a5fa"));
  const note = normalizeRgb(scratch, NOTE_COLOR);

  return {
    background: rgb(bg),
    edge: rgba(border, 0.3),
    edgeTag: rgba(border, 0.16),
    edgeNote: rgba(note, 0.55),
    edgeHierarchy: rgba(note, 0.9),
    label: rgb(fg),
    labelHalo: rgba(bg, 0.82),
    selectRing: rgb(accent),
    hoverRing: rgba(accent, 0.6),
    noteRing: rgb(note),
    dimAlpha: 0.12,
  };
}

type Rgb = [number, number, number];

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
