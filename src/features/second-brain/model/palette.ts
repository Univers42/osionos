/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   palette.ts                                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { hashString } from "./value";

/**
 * Color tokens for the graph (doc 01 §3 / doc 05) — the "Warm Constellation".
 *
 * `record` nodes are colored by their database from ONE curated warm family
 * (mirror of `@osionos/graph-engine`'s `categorical.ts`) so ANY backend table is
 * first-class yet the graph stays on osionos's editorial brand instead of a
 * rainbow. Notes use one reserved hue so "knowledge I wrote" reads apart from
 * "data I have" at a glance.
 */

/** One reserved hue for note nodes — warm amber, distinct from every database color. */
export const NOTE_COLOR = "oklch(0.7 0.13 65)";

/** Neutral, desaturated warm taupe for structural tag-hub nodes. */
export const TAG_COLOR = "oklch(0.66 0.03 70)";

/** Eight curated mid-tone warm hues (kept in sync with the engine's categorical.ts). */
const WARM_CATEGORICAL = [
  "oklch(0.60 0.12 45)", // terracotta-brown
  "oklch(0.63 0.11 65)", // clay
  "oklch(0.68 0.12 85)", // amber-ochre
  "oklch(0.64 0.09 120)", // warm-olive
  "oklch(0.62 0.07 190)", // muted-teal
  "oklch(0.60 0.07 245)", // dusty-blue
  "oklch(0.58 0.09 320)", // plum
  "oklch(0.62 0.10 10)", // dusty-rose
] as const;

/**
 * Deterministic per-database color from the curated warm family — distinct,
 * repeatable, and bounded so the whole graph reads as one coherent palette.
 */
export function databaseColor(databaseId: string): string {
  return WARM_CATEGORICAL[hashString(databaseId) % WARM_CATEGORICAL.length];
}
