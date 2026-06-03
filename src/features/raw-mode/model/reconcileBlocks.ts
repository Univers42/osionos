/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   reconcileBlocks.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "@/entities/block";

/**
 * `parseMarkdownToBlocks` mints a fresh `crypto.randomUUID()` for every block on
 * every call, so two parses of the same source yield value-identical blocks with
 * different object references. That defeats `React.memo(ReadOnlyBlock)`, which
 * compares blocks by reference — so a single keystroke re-renders the whole
 * preview tree.
 *
 * `reconcileBlocks` diffs a freshly parsed tree against the previous one and
 * *reuses the previous object reference* wherever a block is structurally
 * unchanged. Unchanged blocks then keep a stable identity, `React.memo`
 * short-circuits them, and only the block the caret is actually in re-renders.
 */

/** Deep value-equality of two blocks, ignoring volatile `id`s. */
function blocksEquivalent(a: Block, b: Block): boolean {
  if (a === b) return true;
  if (a.type !== b.type) return false;

  // Compare every own field except `id` (always fresh) and `children` (below).
  // Object/array fields (tableData, tableConfig, …) are fresh references each
  // parse, so they compare unequal — which is safe: it only forces a re-render,
  // never a stale reuse.
  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (key === "id" || key === "children") continue;
    if (a[key] !== b[key]) return false;
  }

  const aChildren = a.children;
  const bChildren = b.children;
  if (aChildren === bChildren) return true;
  if (!aChildren || !bChildren || aChildren.length !== bChildren.length) return false;
  for (let i = 0; i < aChildren.length; i += 1) {
    if (!blocksEquivalent(aChildren[i], bChildren[i])) return false;
  }
  return true;
}

/**
 * Return `next` with every structurally-unchanged block swapped for its
 * counterpart from `previous`, preserving reference identity (and stable `id`s
 * for keys) so memoized children can skip re-rendering.
 *
 * Matching is positional: typing inside a block keeps every other block at the
 * same index, so its identity survives. Inserting/removing a block shifts the
 * following indices and re-renders the tail — no worse than today's full
 * re-render, and the common edit-in-place case becomes O(1) renders.
 */
export function reconcileBlocks(next: Block[], previous: Block[]): Block[] {
  if (previous.length === 0) return next;
  return next.map((nextBlock, index) => {
    const prevBlock = previous[index];
    if (!prevBlock || prevBlock.type !== nextBlock.type) return nextBlock;
    if (blocksEquivalent(nextBlock, prevBlock)) return prevBlock;

    // Same kind of block, but something changed. Keep the previous `id` so the
    // React key is stable (no remount), and recurse so unchanged descendants
    // keep their identity too.
    const children =
      nextBlock.children && prevBlock.children
        ? reconcileBlocks(nextBlock.children, prevBlock.children)
        : nextBlock.children;
    return { ...nextBlock, id: prevBlock.id, children };
  });
}
