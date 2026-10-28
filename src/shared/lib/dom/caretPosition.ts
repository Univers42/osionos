/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   caretPosition.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type React from "react";

const MARGIN = 8;
const GAP = 6;

/** Where a caret menu opens: `y` is the caret's bottom, `top` its top. */
export interface CaretPosition {
  x: number;
  y: number;
  top: number;
}

/**
 * Fixed-position style for a menu under the caret, or above it when the cap does not fit
 * below and more room is above. Above, the menu hangs from `bottom`: its real height is
 * unknown here, and a `top` derived from the cap left short menus far over the caret.
 * The menu shrinks to the chosen side and never covers the caret line.
 */
export function caretPopoverStyle(position: CaretPosition, width: number, maxHeightCap: number): React.CSSProperties {
  const vw = typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : 1024;
  const vh = typeof globalThis.innerHeight === "number" ? globalThis.innerHeight : 768;
  const left = Math.min(Math.max(position.x, MARGIN), Math.max(MARGIN, vw - width - MARGIN));
  const spaceBelow = vh - position.y - GAP - MARGIN;
  const spaceAbove = position.top - GAP - MARGIN;
  if (spaceBelow < maxHeightCap && spaceAbove > spaceBelow) {
    return { bottom: vh - (position.top - GAP), left, maxHeight: Math.min(maxHeightCap, spaceAbove) };
  }
  return { top: position.y + GAP, left, maxHeight: Math.max(0, Math.min(maxHeightCap, spaceBelow)) };
}
