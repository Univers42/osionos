/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   selectors.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:16 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:16 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { unionFrames } from "./geometry";
import type { CanvasCell, CanvasFrame, CanvasState } from "./types";

export function getCellsOrderedByZ(cells: CanvasCell[]): CanvasCell[] {
  return [...cells].sort((left, right) => left.z - right.z || left.id.localeCompare(right.id));
}

export function getSelectedCells(state: CanvasState): CanvasCell[] {
  const selected = new Set(state.selectedIds);
  return state.cells.filter((cell) => selected.has(cell.id));
}

export function getContentExtent(cells: CanvasCell[], padding = 48): CanvasFrame {
  const extent = unionFrames(cells.map((cell) => cell.frame));
  return { x: 0, y: 0, width: Math.max(extent.x + extent.width + padding, padding), height: Math.max(extent.y + extent.height + padding, padding) };
}

export function getNextZ(cells: CanvasCell[]): number {
  return cells.reduce((max, cell) => Math.max(max, cell.z), -1) + 1;
}

export function hasCellOverlap(cells: CanvasCell[], candidate: CanvasCell, ignoredIds = new Set<string>()): boolean {
  return cells.some((cell) => !ignoredIds.has(cell.id) && cell.id !== candidate.id && framesOverlap(cell.frame, candidate.frame));
}

function framesOverlap(left: CanvasFrame, right: CanvasFrame): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}
