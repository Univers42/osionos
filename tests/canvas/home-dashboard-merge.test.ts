/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   home-dashboard-merge.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Home dashboard's re-seed is a three-way merge (P2-4-b): the seed says
// what a block should look like, the fingerprints say what it looked like when
// it was seeded, and the page says what the user did to it since. One case per
// row of the merge table, plus the two page shapes the merge has to survive
// (a page that does not exist yet, a page cached before the fingerprints).

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "@/entities/block";
import {
  fingerprintHomeBlock,
  mergeHomeContent,
} from "@/widgets/page-renderer/model/homeContentMerge";

function block(id: string, content: string, extra: Partial<Block> = {}): Block {
  return { id, type: "paragraph", content, ...extra };
}

function ids(blocks: Block[]): string[] {
  return blocks.map((entry) => entry.id);
}

test("home-merge: a block the user added is kept, in place", () => {
  const seed = block("seed-a", "seeded");
  const user = block("user-a", "mine");
  const merged = mergeHomeContent([user, seed], [seed], { "seed-a": fingerprintHomeBlock(seed) });

  assert.deepEqual(ids(merged.content), ["user-a", "seed-a"], "the user's block stays where it was");
  assert.equal(merged.content[0].content, "mine");
});

test("home-merge: an unchanged seed block is replaced in place by the new seed", () => {
  const seeded = block("seed-a", "old wording");
  const reseeded = block("seed-a", "new wording");
  const merged = mergeHomeContent([seeded], [reseeded], { "seed-a": fingerprintHomeBlock(seeded) });

  assert.deepEqual(ids(merged.content), ["seed-a"]);
  assert.equal(merged.content[0].content, "new wording", "the seed wins on an untouched block");
  assert.equal(
    merged.fingerprints["seed-a"],
    fingerprintHomeBlock(reseeded),
    "the fingerprint follows the new seed",
  );
});

test("home-merge: a seed block the seed dropped is removed", () => {
  const kept = block("seed-a", "a");
  const dropped = block("seed-b", "b");
  const merged = mergeHomeContent([kept, dropped], [kept], {
    "seed-a": fingerprintHomeBlock(kept),
    "seed-b": fingerprintHomeBlock(dropped),
  });

  assert.deepEqual(ids(merged.content), ["seed-a"], "the dropped block is gone");
  assert.equal(
    merged.fingerprints["seed-b"],
    fingerprintHomeBlock(dropped),
    "its fingerprint entry is kept, so it stays deleted",
  );
});

test("home-merge: an edited seed block is kept as written, with its old fingerprint", () => {
  const seeded = block("seed-a", "seeded wording");
  const edited = block("seed-a", "my wording");
  const reseeded = block("seed-a", "new wording");
  const merged = mergeHomeContent([edited], [reseeded], { "seed-a": fingerprintHomeBlock(seeded) });

  assert.equal(merged.content[0].content, "my wording", "the user's wording survives");
  assert.equal(
    merged.fingerprints["seed-a"],
    fingerprintHomeBlock(seeded),
    "the old fingerprint is kept, so the block stays 'edited'",
  );
});

test("home-merge: a seed block the user deleted stays deleted", () => {
  const seeded = block("seed-a", "seeded");
  const merged = mergeHomeContent([], [seeded], { "seed-a": fingerprintHomeBlock(seeded) });

  assert.deepEqual(merged.content, [], "the deleted block does not come back");
  assert.equal(merged.fingerprints["seed-a"], fingerprintHomeBlock(seeded), "its fingerprint entry is kept");
});

test("home-merge: a new seed block is inserted after its nearest preceding seed block", () => {
  const first = block("seed-a", "a");
  const added = block("seed-b", "b");
  const merged = mergeHomeContent([first], [first, added], { "seed-a": fingerprintHomeBlock(first) });

  assert.deepEqual(ids(merged.content), ["seed-a", "seed-b"], "the new block lands after its predecessor");
  assert.equal(merged.fingerprints["seed-b"], fingerprintHomeBlock(added), "the new block is fingerprinted");
});

test("home-merge: a new seed block with no predecessor in the result goes first", () => {
  const seeded = block("seed-a", "a");
  const added = block("seed-b", "b");
  const merged = mergeHomeContent([seeded], [added, seeded], { "seed-a": fingerprintHomeBlock(seeded) });

  assert.deepEqual(ids(merged.content), ["seed-b", "seed-a"], "the new block opens the stack");
});

test("home-merge: a page that does not exist yet is seeded whole, every block fingerprinted", () => {
  const seed = [block("seed-a", "a"), block("seed-b", "b")];
  const merged = mergeHomeContent([], seed, undefined);

  assert.deepEqual(ids(merged.content), ["seed-a", "seed-b"], "the seed order is kept");
  assert.deepEqual(merged.fingerprints, {
    "seed-a": fingerprintHomeBlock(seed[0]),
    "seed-b": fingerprintHomeBlock(seed[1]),
  });
});

test("home-merge: a legacy page without fingerprints keeps the user's own blocks only", () => {
  const seeded = block("seed-a", "seeded wording");
  const edited = block("seed-a", "edited before the change");
  const user = block("user-a", "mine");
  const reseeded = block("seed-a", "new wording");
  const merged = mergeHomeContent([edited, user], [reseeded], undefined);

  assert.deepEqual(ids(merged.content), ["seed-a", "user-a"]);
  assert.equal(
    merged.content[0].content,
    "new wording",
    "a legacy seed block reads as unchanged: its pre-change edit is lost once",
  );
  assert.equal(merged.content[1].content, "mine", "a block the seed never had is the user's");
  assert.equal(merged.fingerprints["seed-a"], fingerprintHomeBlock(reseeded));
});

test("home-merge: merging twice changes nothing", () => {
  const seeded = block("seed-a", "seeded");
  const edited = block("seed-a", "my wording");
  const user = block("user-a", "mine");
  const reseeded = [block("seed-a", "new wording"), block("seed-b", "b")];

  const first = mergeHomeContent([edited, user], reseeded, { "seed-a": fingerprintHomeBlock(seeded) });
  const second = mergeHomeContent(first.content, reseeded, first.fingerprints);

  assert.deepEqual(second.content, first.content, "the content is stable");
  assert.deepEqual(second.fingerprints, first.fingerprints, "the fingerprints are stable");
});

test("home-merge: the fingerprint is a hex digest that follows the block's content", () => {
  const one = block("seed-a", "a");
  const two = block("seed-a", "b");

  assert.match(fingerprintHomeBlock(one), /^[0-9a-f]{8}$/, "hex, eight digits");
  assert.equal(fingerprintHomeBlock(one), fingerprintHomeBlock(block("seed-a", "a")), "stable");
  assert.notEqual(fingerprintHomeBlock(one), fingerprintHomeBlock(two), "content decides");
});
