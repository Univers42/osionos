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
 * Color tokens for the graph (doc 01 §3 / doc 05).
 *
 * `record` nodes are colored by their database via a generated, stable palette —
 * replacing the old hard-coded six-color `NODE_COLORS` map so ANY backend table
 * is first-class. Notes use one reserved hue so "knowledge I wrote" reads apart
 * from "data I have" at a glance.
 */

/** One reserved hue for note nodes, distinct from every database color. */
export const NOTE_COLOR = "oklch(0.78 0.15 75)"; // warm amber

/** Neutral, desaturated color for structural tag-hub nodes. */
export const TAG_COLOR = "oklch(0.7 0.03 250)";

/**
 * Deterministic per-database color via golden-angle hue rotation — distinct,
 * repeatable, and unbounded in the number of databases it supports.
 */
export function databaseColor(databaseId: string): string {
  const hue = (hashString(databaseId) * 137.508) % 360;
  return `oklch(0.62 0.13 ${hue.toFixed(1)})`;
}
