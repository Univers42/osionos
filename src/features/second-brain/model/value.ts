/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   value.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Pure value-normalization helpers for the Second Brain projection.
 *
 * Lifted and generalized from the original `homeKnowledgeGraphData.ts` so the
 * graph model has a single, tested place that turns heterogeneous page-property
 * values (string | number | boolean | array | object) into the scalar/array
 * shapes the projection needs. No I/O, no React — safe to unit-test in isolation.
 */

/** Coerce any property value to a display string. */
export function textValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(", ");
  return JSON.stringify(value);
}

/** Coerce any property value to a flat array of non-empty strings. */
export function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
  const text = textValue(value);
  return text ? [text] : [];
}

/** Coerce any property value to a finite number (0 when not parseable). */
export function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Parse an ISO timestamp into a monotonic numeric version (0 when missing). */
export function versionFromTimestamp(updatedAt: string | undefined): number {
  if (!updatedAt) return 0;
  const ms = Date.parse(updatedAt);
  return Number.isFinite(ms) ? ms : 0;
}

/** Stable, fast string hash (FNV-ish via Math.imul). Used for palette + seeds. */
export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + (value.codePointAt(index) ?? 0);
  }
  return Math.abs(hash);
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
