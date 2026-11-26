/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   dockFrame.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { CSSProperties } from "react";

import {
  DOCK_MIN_WIDTH,
  clampDockHeight,
  clampDockWidth,
  type DockPosition,
} from "@/widgets/workbench/model/workbenchLayout";

/** The dock card's outer margins per position, as whole literals so Tailwind sees every class.
 *  The edge that touches the splitter has none: the splitter is the gap on that side. */
export const DOCK_MARGIN: Readonly<Record<DockPosition, string>> = Object.freeze({
  bottom: "mx-[var(--osio-frame-gap)] mb-[var(--osio-frame-gap)]",
  right: "my-[var(--osio-frame-gap)] mr-[var(--osio-frame-gap)]",
  left: "my-[var(--osio-frame-gap)] ml-[var(--osio-frame-gap)]",
});

/** The dock's inline size: a height at the bottom, a width on a side. Both are clamped to the
 *  window now, because a stored size can predate a smaller one. */
export function dockSizeStyle(position: DockPosition, height: number, width: number): CSSProperties {
  if (position === "bottom") {
    return { height: clampDockHeight(height, globalThis.innerHeight), minHeight: "var(--osio-dock-min-h)" };
  }
  return { width: clampDockWidth(width, globalThis.innerWidth), minWidth: DOCK_MIN_WIDTH };
}
