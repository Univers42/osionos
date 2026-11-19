/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   coverFields.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/19 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/19 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The read-side validator for a page's cover layout (groot ADR 0064 PS27). Server rows, seeds
// and `.omd` files all cross it, so a value that fails it never reaches a page: it is dropped,
// and an inbound copy without a key leaves the local value as it was (PS25).

import type { PageEntry } from "./types";

export const COVER_HEIGHT_MIN = 120;
export const COVER_HEIGHT_MAX = 640;

export type CoverFields = Pick<PageEntry, "coverPosition" | "coverHeight" | "coverWidth">;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Vertical focal point in %: a finite 0–100, anything else dropped (never coerced). */
export function readCoverPosition(value: unknown): number | undefined {
  return isFiniteNumber(value) && value >= 0 && value <= 100 ? value : undefined;
}

/** Cover height in px: rounded to an integer and clamped to 120–640; a non-number is dropped. */
export function readCoverHeight(value: unknown): number | undefined {
  if (!isFiniteNumber(value)) return undefined;
  return Math.min(COVER_HEIGHT_MAX, Math.max(COVER_HEIGHT_MIN, Math.round(value)));
}

export function readCoverWidth(value: unknown): PageEntry["coverWidth"] | undefined {
  return value === "full" || value === "content" ? value : undefined;
}

/** Only the keys that pass, so spreading the result over a page never erases a field. */
export function readCoverFields(source: { readonly [K in keyof CoverFields]?: unknown }): CoverFields {
  const fields: CoverFields = {};
  const position = readCoverPosition(source.coverPosition);
  const height = readCoverHeight(source.coverHeight);
  const width = readCoverWidth(source.coverWidth);
  if (position !== undefined) fields.coverPosition = position;
  if (height !== undefined) fields.coverHeight = height;
  if (width !== undefined) fields.coverWidth = width;
  return fields;
}
