/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-content-merge.sweep.ts                          :+:      :+:    :+:   */
/*                                                    +#+ +#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The wide seeded sweep of the page merge: 40 seeds x 400 rounds of rival trees, every round
// checked against the merge's promises, plus the histogram of the rounds the fixed point loop
// needs. A tool, not a test — the suite runs the single-seed walk (page-content-merge.test.ts),
// this one runs the sweep wide and prints the numbers.
//
//   node --experimental-strip-types --experimental-loader \
//     ./tests/canvas/ts-extension-loader.mjs tests/canvas/page-content-merge.sweep.ts
//
// SEEDS and ROUNDS override the sweep's size (SEEDS=40 ROUNDS=600 is the 24,000-tree run).
// Ponytail: the invariants are the ones the test file already checks — this runs them many
// more times and counts the rounds, it does not add new promises.

import process from "node:process";

import type { Block } from "@/entities/block";
import { mergePageContent } from "@/store/sync/mergePageContent";
import { mergeTree } from "@/store/sync/mergePageContent.blocks";
import { deepEqual, sameBlock } from "@/store/sync/mergePageContent.tree";
import {
  applyEdits,
  buildTree,
  cloneTree,
  collectIds,
  indexBlocks,
  mulberry32,
  randomTree,
} from "./page-content-merge.fixtures";

const SEEDS = Number(process.env.SEEDS ?? 40);
const ROUNDS = Number(process.env.ROUNDS ?? 400);
/** The rounds the fixed point loop of mergePageContent.ts is allowed to take. */
const MAX_ROUNDS = 4;

/** The fixed point loop, counted: the extra rounds it took and whether it settled. The loop
 *  is the one of mergePageContent.ts, round for round, so the histogram says what the bound
 *  really costs. */
function fixedPoint(
  base: Block[],
  local: Block[],
  server: Block[],
): { rounds: number; settled: boolean } {
  let content = mergeTree(base, local, server).content;
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const next = mergeTree(base, content, server);
    if (deepEqual(next.content, content)) return { rounds: round, settled: true };
    content = next.content;
  }
  return { rounds: MAX_ROUNDS, settled: false };
}

const failures: string[] = [];
const histogram = new Map<number, number>();
let merges = 0;

for (let seed = 0; seed < SEEDS; seed += 1) {
  const random = mulberry32(20261021 + seed * 7919);
  let counter = 0;
  const nextId = (): string => `s${seed}n${counter++}`;
  for (let round = 0; round < ROUNDS; round += 1) {
    const baseFlat = randomTree(random, nextId);
    const localFlat = cloneTree(baseFlat);
    const serverFlat = cloneTree(baseFlat);
    applyEdits(localFlat, random, nextId);
    applyEdits(serverFlat, random, nextId);
    const base = buildTree(baseFlat);
    const local = buildTree(localFlat);
    const server = buildTree(serverFlat);
    const merged = mergePageContent(base, local, server);
    const mergedIds = collectIds(merged.content);
    const where = `seed ${seed}, round ${round}`;

    // No id twice.
    if (new Set(mergedIds).size !== mergedIds.length) {
      failures.push(`a block id appears twice (${where})`);
    }

    // Every local block survives, unless the server deleted it and the local never touched it.
    const baseById = indexBlocks(base);
    const localById = indexBlocks(local);
    const serverIds = new Set(collectIds(server));
    for (const [id, block] of localById) {
      const baseBlock = baseById.get(id);
      const deletedByRule4 =
        baseBlock !== undefined && !serverIds.has(id) && sameBlock(baseBlock, block);
      if (deletedByRule4) continue;
      if (!mergedIds.includes(id)) failures.push(`the local block ${id} was lost (${where})`);
    }

    // Every block the server added survives.
    const baseIds = new Set(collectIds(base));
    const localIds = new Set(collectIds(local));
    for (const id of serverIds) {
      if (baseIds.has(id) || localIds.has(id)) continue;
      if (!mergedIds.includes(id)) failures.push(`the server's block ${id} was lost (${where})`);
    }

    // Rule 8: merging the result again changes nothing.
    if (!deepEqual(mergePageContent(base, merged.content, server).content, merged.content)) {
      failures.push(`re-merging changed the result (${where})`);
    }

    const fixed = fixedPoint(base, local, server);
    histogram.set(fixed.rounds, (histogram.get(fixed.rounds) ?? 0) + 1);
    merges += 1;
  }
}

const rounds = [...histogram.keys()].sort((a, b) => a - b);
const spread = rounds.map((round) => `${round}: ${histogram.get(round)}`).join(", ");
console.log(`sweep: ${SEEDS} seeds x ${ROUNDS} rounds = ${merges} merged trees`);
console.log(`rounds the fixed point needed (extra merge rounds): ${spread}`);
console.log(`${failures.length} failing`);
for (const failure of failures.slice(0, 10)) console.log(`  ${failure}`);
if (failures.length > 0) process.exitCode = 1;
