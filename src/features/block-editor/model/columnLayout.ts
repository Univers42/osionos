/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   columnLayout.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Pure column-layout tree ops. Kept out of the React surface so the
 *  create-a-column logic (the source of the old catastrophic nesting) is
 *  testable in isolation. Invariant: a column_list holds a FLAT row of columns;
 *  a column_list is never nested directly inside a column. */

import type { Block } from "@/entities/block";

function cloneBlock(block: Block): Block {
  return { ...block, children: block.children?.map(cloneBlock) };
}

export function createColumn(children: Block[], widthRatio: number): Block {
  return { id: crypto.randomUUID(), type: "column", content: "", widthRatio, children };
}

/** Equal shares (1/n) so a column row always renders as even columns. */
export function equalizeColumns(columns: Block[]): Block[] {
  const ratio = 1 / Math.max(columns.length, 1);
  return columns.map((column) => ({ ...column, widthRatio: ratio }));
}

function columnContainsBlock(column: Block, targetId: string): boolean {
  const walk = (list?: Block[]): boolean =>
    Array.isArray(list) && list.some((child) => child.id === targetId || walk(child.children));
  return walk(column.children);
}

/**
 * Drop `draggedBlock` beside `targetId` to form or extend a FLAT column row:
 *  - target already inside a column_list → insert a new SIBLING column (re-balanced);
 *  - otherwise → wrap target + dragged into a fresh 2-column list.
 * Never nests a column_list inside a column (the old catastrophic bug).
 */
export function insertColumnForTarget(blocks: Block[], targetId: string, draggedBlock: Block, side: "left" | "right"): Block[] {
  return blocks.map((block) => {
    if (block.type === "column_list" && block.children) {
      const columnIndex = block.children.findIndex((column) => columnContainsBlock(column, targetId));
      if (columnIndex >= 0) {
        const insertAt = side === "left" ? columnIndex : columnIndex + 1;
        const columns = [
          ...block.children.slice(0, insertAt),
          createColumn([draggedBlock], 0),
          ...block.children.slice(insertAt),
        ];
        return { ...block, children: equalizeColumns(columns) };
      }
    }
    if (block.id === targetId) {
      const columns = equalizeColumns(
        side === "left"
          ? [createColumn([draggedBlock], 0), createColumn([cloneBlock(block)], 0)]
          : [createColumn([cloneBlock(block)], 0), createColumn([draggedBlock], 0)],
      );
      return { id: crypto.randomUUID(), type: "column_list", content: "", children: columns };
    }
    return block.children?.length
      ? { ...cloneBlock(block), children: insertColumnForTarget(block.children, targetId, draggedBlock, side) }
      : cloneBlock(block);
  });
}
