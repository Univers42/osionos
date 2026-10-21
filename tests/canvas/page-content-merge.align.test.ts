/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-content-merge.align.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The order alignment the merge runs on every container: the LCS of the base's ids and a
// side's ids. It used to be a table of the two sequences' product — a 5,000-block page paid
// 25 million cells, twice per container, per merge round. It is now the longest increasing
// subsequence of the side's base indices (the ids of a container are unique, so the two are
// the same thing), and these tests pin it: against the old table, as an oracle, and on a
// page big enough for the old one to hurt.

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Block } from "@/entities/block";
import { mergePageContent } from "@/store/sync/mergePageContent";
import { align } from "@/store/sync/mergePageContent.tree";
import { mulberry32 } from "./page-content-merge.fixtures";

const para = (id: string, content: string): Block => ({ id, type: "paragraph", content });
const ids = (blocks: Block[]): string[] => blocks.map((block) => block.id);

/**
 * The old alignment, kept here as the oracle: the LCS of two id sequences, by the table.
 * The table is O(base x side) — it is the thing the merge no longer builds, so it lives in
 * the test and nowhere else.
 */
function alignOracle(base: string[], side: string[]): Map<number, number> {
  const pos = new Map<number, number>();
  const rows = base.length + 1;
  const cols = side.length + 1;
  if (base.length === 0 || side.length === 0) return pos;
  const table = new Uint32Array(rows * cols);
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      table[i * cols + j] =
        base[i - 1] === side[j - 1]
          ? table[(i - 1) * cols + (j - 1)] + 1
          : Math.max(table[(i - 1) * cols + j], table[i * cols + (j - 1)]);
    }
  }
  let i = base.length;
  let j = side.length;
  while (i > 0 && j > 0) {
    if (base[i - 1] === side[j - 1]) {
      pos.set(i - 1, j - 1);
      i -= 1;
      j -= 1;
    } else if (table[(i - 1) * cols + j] >= table[i * cols + (j - 1)]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return pos;
}

/** A pair of id sequences: a base, and a side that keeps a subset of it, shuffles a window
 *  of it and adds ids of its own. Every id is unique. */
function randomPair(
  random: () => number,
  nextId: () => string,
): { base: string[]; side: string[] } {
  const base: string[] = [];
  const baseLength = Math.floor(random() * 61);
  for (let index = 0; index < baseLength; index += 1) base.push(nextId());
  const side: string[] = [];
  for (const id of base) if (random() > 0.3) side.push(id);
  const inserts = Math.floor(random() * 6);
  for (let index = 0; index < inserts; index += 1) {
    side.splice(Math.floor(random() * (side.length + 1)), 0, nextId());
  }
  if (side.length > 2 && random() < 0.7) {
    const from = Math.floor(random() * side.length);
    const to = Math.min(side.length, from + 2 + Math.floor(random() * 12));
    const chunk = side.slice(from, to);
    for (let index = chunk.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [chunk[index], chunk[swap]] = [chunk[swap], chunk[index]];
    }
    side.splice(from, chunk.length, ...chunk);
  }
  return { base, side };
}

test("the alignment is the LCS the table computed, and a common subsequence besides", () => {
  const seed = 20261022;
  const random = mulberry32(seed);
  let counter = 0;
  const nextId = (): string => `p${counter++}`;
  for (let round = 0; round < 300; round += 1) {
    const { base, side } = randomPair(random, nextId);
    const alignment = align(base, side);
    const oracle = alignOracle(base, side);
    const where = `seed ${seed}, round ${round}`;

    // The same length as the old table: the LCS is the LCS.
    assert.equal(
      alignment.pos.size,
      oracle.size,
      `the alignment is ${alignment.pos.size} long, the oracle ${oracle.size} (${where})`,
    );

    // A common subsequence: strictly increasing in both sequences, and every pair the same
    // id on both sides.
    const pairs = [...alignment.pos].sort((a, b) => a[0] - b[0]);
    for (let index = 1; index < pairs.length; index += 1) {
      assert.ok(
        pairs[index][0] > pairs[index - 1][0],
        `the alignment is not increasing in the base (${where})`,
      );
      assert.ok(
        pairs[index][1] > pairs[index - 1][1],
        `the alignment is not increasing in the side (${where})`,
      );
    }
    for (const [baseIndex, sideIndex] of pairs) {
      assert.equal(
        base[baseIndex],
        side[sideIndex],
        `the alignment pairs two different ids (${where})`,
      );
    }
  }
});

test("a 5,000-block page merges: the local's edit and inserts, the server's delete and appends", () => {
  const base: Block[] = [];
  for (let index = 0; index < 5000; index += 1) base.push(para(`b${index}`, `block ${index}`));
  // The local edits block 10 and inserts three blocks after block 2,500.
  const local = base.map((block) => ({ ...block }));
  local[10] = para("b10", "block 10, edited");
  local.splice(2501, 0, para("l1", "local 1"), para("l2", "local 2"), para("l3", "local 3"));
  // The server deletes block 4,000 and appends three blocks.
  const server = base.filter((block) => block.id !== "b4000");
  server.push(para("s1", "server 1"), para("s2", "server 2"), para("s3", "server 3"));

  const result = mergePageContent(base, local, server);
  const merged = ids(result.content);

  // 1. The local's edit survives: the server never touched the block.
  assert.equal(
    result.content.find((block) => block.id === "b10")?.content,
    "block 10, edited",
  );
  // 2. The local's inserts survive, right after the block they were pasted after.
  assert.deepEqual(merged.slice(2501, 2504), ["l1", "l2", "l3"]);
  // 3. The server's delete stands: the local never touched the block.
  assert.ok(!merged.includes("b4000"), "the block the server deleted is still there");
  // 4. The server's appended blocks survive, at the end.
  assert.deepEqual(merged.slice(-3), ["s1", "s2", "s3"]);
  assert.equal(merged.length, 5005);
});
