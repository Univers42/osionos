/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   rawModeLayout.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export type RawLayoutMode = "code" | "preview" | "split";

export interface RawLayout {
  mode: RawLayoutMode;
  /** Code pane fraction (0..1) when mode is "split". */
  ratio: number;
}

export const DEFAULT_RAW_LAYOUT: RawLayout = { mode: "split", ratio: 0.5 };
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

/**
 * Where dragging the header would dock the document: left edge = code only,
 * right edge = preview only, middle = side-by-side split. Drives the live
 * overlay shown while sliding so the reorganization previews before drop.
 */
export function dropZoneFromX(clientX: number, rect: DOMRect): RawLayoutMode {
  const fraction = (clientX - rect.left) / Math.max(1, rect.width);
  if (fraction < 0.3) return "code";
  if (fraction > 0.7) return "preview";
  return "split";
}

/** Clamps a split divider drag (pointer X) to a sane code-pane fraction. */
export function ratioFromX(clientX: number, rect: DOMRect): number {
  const fraction = (clientX - rect.left) / Math.max(1, rect.width);
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, fraction));
}
