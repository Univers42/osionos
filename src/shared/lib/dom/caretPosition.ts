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
 * Fixed-position style for a menu under the caret, flipped above it when it would
 * overflow the viewport bottom, and clamped inside the viewport either way.
 */
export function caretPopoverStyle(position: CaretPosition, width: number, maxHeightCap: number): React.CSSProperties {
  const vw = typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : 1024;
  const vh = typeof globalThis.innerHeight === "number" ? globalThis.innerHeight : 768;
  const maxHeight = Math.min(maxHeightCap, vh - MARGIN * 2);
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));
  const belowTop = position.y + GAP;
  const aboveTop = position.top - GAP - maxHeight;
  const overflowsBelow = belowTop + maxHeight > vh - MARGIN;
  const top = overflowsBelow && aboveTop >= MARGIN ? aboveTop : clamp(belowTop, MARGIN, vh - maxHeight - MARGIN);
  return { top, left: clamp(position.x, MARGIN, vw - width - MARGIN), maxHeight };
}
