/**
 * Color palette for the graph — the "Warm Constellation".
 *
 * `record` nodes are colored by their database from ONE curated warm family
 * (`categorical.ts`) so ANY backend table is first-class yet the whole graph
 * stays on osionos's editorial brand instead of a rainbow. Notes/tags use
 * reserved warm hues. The background ramp + field tints are fallbacks — `tokens.ts`
 * prefers live `--osio-graph-*` custom properties when present.
 */

import { hashString } from "../math";
import { pickCategorical } from "./categorical";

/** One reserved hue for note nodes — warm amber, distinct from every database color. */
export const NOTE_COLOR = "oklch(0.7 0.13 65)";

/** Neutral, desaturated warm taupe for structural tag-hub nodes (legible as a ring). */
export const TAG_COLOR = "oklch(0.66 0.03 70)";

/** Warm "moat" painted under every node so it separates from the field at any hue. */
export const NODE_BACKING = "rgba(20, 18, 14, 0.72)";

/** Background ramp (top → bottom) — warm charcoal "ember" fallback. */
export const AURORA_BG_TOP = "#1b1a17";
export const AURORA_BG_BOTTOM = "#15140f";

/** Warm field/ember band fallbacks (the live design uses a single soft bloom). */
export const AURORA_BANDS = ["#e0937a", "#d9b89c", "#cc785c", "#b45309"] as const;

/**
 * Deterministic per-database color from the curated warm family — distinct,
 * repeatable, and bounded so the sprite cache stays small (8 hues × shapes × glyphs).
 */
export function databaseColor(databaseId: string): string {
  return pickCategorical(hashString(databaseId));
}
