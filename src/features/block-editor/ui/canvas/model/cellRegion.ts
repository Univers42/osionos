/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   cellRegion.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The writer side of a cell's region metadata (the readers live in
// layoutRegion.ts): one reducer action's pure cell update. Every value goes
// through the fixed-enum normalizers, so an unknown value — or a sticky
// outside the sidebars — is stored as an absent key, never as undefined.

import { normalizeRegion, normalizeStackAt, normalizeSticky } from "@/entities/block/model/layoutRegion";
import type { CanvasAction, CanvasCell } from "./types";

/**
 * The cell with only its region fields re-authored: a fresh copy whose
 * `region`, `stackAt` and `sticky` keys are deleted first, then set back
 * only for the values that normalize to one (sticky against the NEW region).
 */
export function applyCellRegion(cell: CanvasCell, action: Extract<CanvasAction, { type: "setCellRegion" }>): CanvasCell {
  const region = normalizeRegion(action.region);
  const stackAt = normalizeStackAt(action.stackAt);
  const sticky = normalizeSticky(action.sticky, region);
  const next: CanvasCell = { ...cell };
  delete next.region;
  delete next.stackAt;
  delete next.sticky;
  if (region !== undefined) next.region = region;
  if (stackAt !== undefined) next.stackAt = stackAt;
  if (sticky !== undefined) next.sticky = sticky;
  return next;
}
