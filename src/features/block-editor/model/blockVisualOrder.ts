/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockVisualOrder.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * VISUAL-order enumeration of rendered blocks, for caret block-crossing.
 *
 * Canvas layout cells are free frames: their model/DOM order diverges from
 * the on-screen arrangement as soon as a cell is added out of sequence or
 * dragged. Flat `querySelectorAll("[data-block-id]")` order then walks the
 * caret out of the visually-first column while skipping its right-hand
 * neighbours — or dead-ends entirely (the pane scrolls, the caret stays).
 * This module re-orders whole cell runs geometrically (left→right, then
 * top→bottom) so arrow navigation crosses columns the way the eye reads them.
 */

/** Grouping-only wrappers with no editable line of their own. Keeping them in
 * the adjacency list makes them their own neighbour (their first editable IS
 * their first child's), which pins the caret at column/layout edges. */
const CONTAINER_BLOCK_TYPES = new Set(["layout", "column_list", "column"]);

const CELL_SELECTOR = "[data-layout-cell-id]";
const STAGE_SELECTOR = ".osionos-layout-block";

/**
 * All rendered leaf blocks under `root`, in VISUAL order: document order,
 * except that the blocks of a layout stage's cells are re-grouped per cell
 * and the cells sorted left→right then top→bottom. Nested stages (a layout
 * inside a cell) keep approximate document order — each nesting level breaks
 * the outer run, which degrades gracefully to per-fragment sorting.
 */
export function renderedBlocksInVisualOrder(root: ParentNode = document): HTMLElement[] {
  const flat = Array.from(root.querySelectorAll<HTMLElement>("[data-block-id]")).filter(
    (el) => !CONTAINER_BLOCK_TYPES.has(el.dataset.blockType ?? ""),
  );
  // No layout cells (the common page) → document order IS visual order. Skip the
  // per-block ancestor walk below: `closest()` per block ran O(blocks × depth) on
  // every arrow-at-edge and TWICE per delete, only to discover there were no cells.
  if (!root.querySelector(CELL_SELECTOR)) return flat;
  const cellOf = flat.map((el) => el.closest<HTMLElement>(CELL_SELECTOR));
  if (!cellOf.some(Boolean)) return flat;

  const ordered: HTMLElement[] = [];
  let i = 0;
  while (i < flat.length) {
    const cell = cellOf[i];
    if (!cell) {
      ordered.push(flat[i]);
      i += 1;
      continue;
    }
    // Consume the contiguous run of blocks belonging to this cell's stage,
    // bucketed per cell, then emit the buckets in visual cell order.
    const stage = stageOf(cell);
    const runs = new Map<HTMLElement, HTMLElement[]>();
    while (i < flat.length) {
      const runCell = cellOf[i];
      if (!runCell || stageOf(runCell) !== stage) break;
      const run = runs.get(runCell);
      if (run) run.push(flat[i]);
      else runs.set(runCell, [flat[i]]);
      i += 1;
    }
    for (const sortedCell of sortCellsVisually(Array.from(runs.keys()))) {
      ordered.push(...(runs.get(sortedCell) ?? []));
    }
  }
  return ordered;
}

function stageOf(cell: HTMLElement): HTMLElement {
  return cell.closest<HTMLElement>(STAGE_SELECTOR) ?? cell;
}

/** Left→right then top→bottom, snapped to an 8px grid so sub-pixel layout
 * differences between visually aligned columns can't reorder them. */
function sortCellsVisually(cells: HTMLElement[]): HTMLElement[] {
  const position = new Map(
    cells.map((cell) => {
      const rect = cell.getBoundingClientRect();
      return [cell, { x: Math.round(rect.left / 8), y: Math.round(rect.top / 8) }] as const;
    }),
  );
  return cells.slice().sort((a, b) => {
    const pa = position.get(a);
    const pb = position.get(b);
    if (!pa || !pb) return 0;
    return pa.x - pb.x || pa.y - pb.y;
  });
}
