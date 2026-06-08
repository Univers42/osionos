/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   paneDropZone.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** dataTransfer MIME for a tab dragged between panes (payload: {paneId,tabId,tab}). */
export const TAB_DND_MIME = "application/x-osionos-tab";

/** Five VSCode-style drop regions of a pane. */
export type DropZone = "center" | "top" | "right" | "bottom" | "left";

/**
 * Classify a pointer position over a pane: the inner area is "center" (drop as a
 * new tab); within `edge` of a side it is that side (drop = split there).
 */
export function computeDropZone(clientX: number, clientY: number, rect: DOMRect, edge = 0.22): DropZone {
  const rx = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
  const ry = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
  const distances = { left: rx, right: 1 - rx, top: ry, bottom: 1 - ry };
  const nearest = Math.min(distances.left, distances.right, distances.top, distances.bottom);
  if (nearest > edge) return "center";
  if (nearest === distances.left) return "left";
  if (nearest === distances.right) return "right";
  if (nearest === distances.top) return "top";
  return "bottom";
}

/** Map a drop zone to a split (direction + which side the new pane takes). */
export function zoneToSplit(zone: DropZone): { direction: "row" | "column"; side: "before" | "after" } | null {
  if (zone === "center") return null;
  if (zone === "left") return { direction: "row", side: "before" };
  if (zone === "right") return { direction: "row", side: "after" };
  if (zone === "top") return { direction: "column", side: "before" };
  return { direction: "column", side: "after" };
}
