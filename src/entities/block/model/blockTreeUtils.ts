/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   blockTreeUtils.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: sergio <sergio@student.42.fr>              +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/22 12:00:00 by sergio            #+#    #+#             */
/*   Updated: 2026/04/22 12:00:00 by sergio           ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "./types";

/**
 * Recursively find a block by ID in a nested tree of blocks.
 */
export function findBlockInTree(blocks: Block[], blockId: string): Block | null {
  for (const block of blocks) {
    if (block.id === blockId) {
      return block;
    }

    if (block.children?.length) {
      const nested = findBlockInTree(block.children, blockId);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

/** All descendant ids of a block (its own id is NOT included). */
export function collectDescendantIds(block: Block): string[] {
  const ids: string[] = [];
  const walk = (children: Block[] | undefined): void => {
    for (const child of children ?? []) {
      ids.push(child.id);
      walk(child.children);
    }
  };
  walk(block.children);
  return ids;
}

/**
 * Expand a set of selected block ids to also include every descendant of each
 * selected block — so selecting a parent takes its whole subtree with it.
 */
export function expandSelectionWithDescendants(blocks: Block[], ids: Iterable<string>): Set<string> {
  const result = new Set<string>();
  for (const id of ids) {
    if (result.has(id)) continue;
    result.add(id);
    const block = findBlockInTree(blocks, id);
    if (block) {
      for (const descendantId of collectDescendantIds(block)) {
        result.add(descendantId);
      }
    }
  }
  return result;
}

/**
 * Return a new tree with every block whose id is in `idSet` removed together
 * with its subtree. Unlike deleteBlockFromTree (which promotes children up when
 * a parent is removed), this drops the whole branch — the correct semantics for
 * a hierarchical multi-select delete.
 */
export function removeBlocksFromTree(blocks: Block[], idSet: Set<string>): Block[] {
  const result: Block[] = [];
  for (const block of blocks) {
    if (idSet.has(block.id)) continue;
    if (block.children?.length) {
      result.push({ ...block, children: removeBlocksFromTree(block.children, idSet) });
    } else {
      result.push(block);
    }
  }
  return result;
}
