/**
 * Color palette for the graph.
 *
 * `record` nodes are colored by their database via a generated, stable palette
 * (golden-angle hue rotation) so ANY backend table is first-class. Notes/tags use
 * reserved hues. The aurora-glass background gets its own deep indigo→violet ramp
 * and a set of drifting band hues; these are fallbacks — `tokens.ts` prefers live
 * `--osio-graph-*` custom properties when present.
 */

import { hashString } from "../math";

/** One reserved hue for note nodes, distinct from every database color. */
export const NOTE_COLOR = "oklch(0.78 0.15 75)"; // warm amber

/** Neutral, desaturated color for structural tag-hub nodes. */
export const TAG_COLOR = "oklch(0.7 0.03 250)";

/** Aurora background ramp (top → bottom) — deep indigo into violet-black. */
export const AURORA_BG_TOP = "#0b0a1f";
export const AURORA_BG_BOTTOM = "#160c30";

/** Drifting aurora band colors (indigo / violet / electric blue / orchid). */
export const AURORA_BANDS = ["#4338ca", "#7c3aed", "#2563eb", "#a21caf"] as const;

/**
 * Deterministic per-database color via golden-angle hue rotation — distinct,
 * repeatable, and unbounded in the number of databases it supports.
 */
export function databaseColor(databaseId: string): string {
  const hue = (hashString(databaseId) * 137.508) % 360;
  return `oklch(0.66 0.15 ${hue.toFixed(1)})`;
}
