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
