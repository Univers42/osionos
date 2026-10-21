/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mergePageContent.ts                                :+:      :+:    :+:   */
/*                                                    +#+ +#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The 3-way merge of a page's block tree. A page is saved as ONE content array with no version
// check, so two writers erase each other (src/store/sync/pendingPages.ts:27-28,
// src/store/sync/mergeServerPages.ts:43-44). When the client learns the server copy moved, it
// merges the base (the last server copy it saw), its own copy, and the new server copy.
// Ponytail: a pure function, no I/O and no imports beyond the block types — the caller owns
// the version, the retry and the copy path (a later brief wires it into the 409 answer).
//
// The rules, one by one:
//   1. No base -> unresolved: the merge never guesses, the server copy stands.
//   2. Own fields: the local's if the server did not touch them, the server's if the local did
//      not, one value if both reached it, a conflict if they reached different ones.
//   3. Inserts: the server's land next to their server siblings, the local's stay put.
//   4. Deletes: gone when the other side never touched them, kept when it did (a conflict).
//   5. Same-block conflict: the local's variant stays, the server's becomes a visible copy
//      right after it (never dropped).
//   6. The rules apply inside every container: a block's children and each layout cell's blocks.
//   7. Moves: the side that moved it wins; when both moved it, the local's place wins.
//   8. Idempotent: merging the result again changes nothing.

import type { Block } from "@/entities/block/model/types";
import { mergeTree } from "./mergePageContent.blocks";
import { deepEqual } from "./mergePageContent.tree";

/** How the merge went: clean, with a conflict to show, or not merged at all. */
export type MergeStatus = "clean" | "conflicts" | "unresolved";

export interface MergeResult {
  /** The merged tree. */
  content: Block[];
  status: MergeStatus;
  /** The ids of the blocks the two sides fought over. */
  conflictIds: string[];
}

/**
 * The merged tree of a page: the base the client last saw, the local copy, the server copy.
 *
 * With no base the merge refuses to guess: the server's copy stands and the status is
 * "unresolved", so the caller routes the local edit to a copy instead (C25). With a base the
 * two sides are merged leaf by leaf, and a block they both changed keeps BOTH variants (C26).
 * The result is stable: merging it again changes nothing (C27).
 */
export function mergePageContent(
  base: Block[] | null,
  local: Block[],
  server: Block[],
): MergeResult {
  if (base === null) {
    return { content: server, status: "unresolved", conflictIds: [] };
  }
  let result = mergeTree(base, local, server);
  const conflictIds = [...result.conflictIds];
  let conflicted = result.conflicted;
  // The order two sides disagree on is not always a fixed point of the merge: merging the
  // result again can settle it. The loop stops as soon as the tree stops moving, so a settled
  // merge costs one extra round and a restless one costs a few. The conflicts the first round
  // found stay reported: a later round sees the merged tree, where the two sides agree.
  for (let round = 0; round < 4; round += 1) {
    const next = mergeTree(base, result.content, server);
    if (next.conflicted) {
      conflicted = true;
      for (const id of next.conflictIds) if (!conflictIds.includes(id)) conflictIds.push(id);
    }
    if (deepEqual(next.content, result.content)) {
      return { content: next.content, status: conflicted ? "conflicts" : "clean", conflictIds };
    }
    result = next;
  }
  return { content: result.content, status: conflicted ? "conflicts" : "clean", conflictIds };
}
