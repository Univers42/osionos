/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markdown-fidelity-fixtures.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "../../src/entities/block/model/types.ts";

/** Deterministic PRNG (mulberry32): same seed always yields the same tree. O(1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Line-start markers a paragraph must survive (escaped with a backslash). */
export const MARKERS: readonly string[] = Object.freeze([
  "- x", "+ x", "* x", "1. x", "2) y", "# x", "## x", "> x",
  "```js", "~~~x", "---", "***", "___", "$$", "- [ ] t", "[x]: y",
]);

let counter = 0;
const nid = (seed: number): string => `f${seed}-${counter++}`;
const pick = (rand: () => number, count: number): number => Math.floor(rand() * count);
const plain = (tag: string, seed: number, rand: () => number): string => `${tag} s${seed} n${pick(rand, 1000)}`;
const CODE_LANGS: readonly string[] = Object.freeze(["js", "ts", "plaintext", "python", "sh"]);

/** One random leaf block (no children); lists/toggles add children later. O(1). */
function leaf(seed: number, rand: () => number): Block {
  const roll = pick(rand, 100);
  if (roll < 12) {
    if (pick(rand, 10) === 0) return { id: nid(seed), type: "paragraph", content: "" };
    if (pick(rand, 4) === 0) return { id: nid(seed), type: "paragraph", content: `${MARKERS[pick(rand, MARKERS.length)]} ${pick(rand, 100)}` };
    return { id: nid(seed), type: "paragraph", content: plain("Body", seed, rand) };
  }
  if (roll < 20) return { id: nid(seed), type: `heading_${1 + pick(rand, 3)}`, content: plain("Head", seed, rand) };
  if (roll < 26) return { id: nid(seed), type: "bulleted_list", content: plain("Bullet", seed, rand) };
  if (roll < 32) return { id: nid(seed), type: "numbered_list", content: plain("Number", seed, rand) };
  if (roll < 38) return { id: nid(seed), type: "to_do", content: plain("Todo", seed, rand), checked: pick(rand, 2) === 0 };
  if (roll < 44) return { id: nid(seed), type: "quote", content: plain("Quote", seed, rand) };
  if (roll < 50) return { id: nid(seed), type: "callout", content: plain("Note", seed, rand), color: "💡" };
  if (roll < 58) {
    const lines: string[] = [];
    const count = 1 + pick(rand, 3);
    for (let index = 0; index < count; index++) lines.push(`line${index} value${pick(rand, 500)}`);
    return { id: nid(seed), type: "code", content: lines.join("\n"), language: CODE_LANGS[pick(rand, CODE_LANGS.length)] ?? "plaintext" };
  }
  if (roll < 62) return { id: nid(seed), type: "divider", content: "" };
  if (roll < 70) {
    const cols = 1 + pick(rand, 5);
    const rows = 1 + pick(rand, 3);
    const data: string[][] = [];
    for (let row = 0; row < rows; row++) {
      const cells: string[] = [];
      for (let col = 0; col < cols; col++) cells.push(`c${row}${col}`);
      data.push(cells);
    }
    return { id: nid(seed), type: "table_block", content: "", tableData: data };
  }
  return { id: nid(seed), type: "paragraph", content: plain("Body", seed, rand) };
}
/**
 * A random tree of up to 40 blocks. Toggles nest to depth 3, lists nest too;
 * empties appear at top level and inside toggles (never inside lists, whose
 * leading empty would merge with the item text). O(B): B blocks built.
 * Ponytail: list-nested paragraph children, list-nested empties and
 * quote/callout children are never generated (unsupported shapes).
 */
export function randomTree(seed: number): Block[] {
  counter = 0;
  const rand = mulberry32(seed);
  const budget = { left: 40 };
  const top: Block[] = [];
  const count = 1 + pick(rand, 8);
  for (let index = 0; index < count && budget.left > 0; index++) {
    budget.left -= 1;
    top.push(grow(seed, rand, budget, 0));
  }
  // Ponytail: a leading "---" divider followed by another "---" parses as
  // front-matter (the parser only looks at the top of the file), so the first
  // block is never a divider; single and non-leading dividers round-trip.
  if (top[0] !== undefined && top[0].type === "divider") {
    top[0] = { id: nid(seed), type: "paragraph", content: plain("Body", seed, rand) };
  }
  return top;
}

/** One block, randomly given children when it is a toggle or list. O(subtree). */
function grow(seed: number, rand: () => number, budget: { left: number }, depth: number): Block {
  const block = leaf(seed, rand);
  if (budget.left <= 0 || depth >= 3) return block;
  if (block.type === "toggle") {
    block.content = plain("Toggle", seed, rand);
    const kids: Block[] = [];
    const count = 1 + pick(rand, 3);
    for (let index = 0; index < count && budget.left > 0; index++) {
      budget.left -= 1;
      kids.push(grow(seed, rand, budget, depth + 1));
    }
    if (kids.length > 0) block.children = kids;
    return block;
  }
  if (block.type === "bulleted_list" || block.type === "numbered_list" || block.type === "to_do") {
    if (pick(rand, 3) === 0 || budget.left <= 0) return block;
    const kids: Block[] = [];
    const count = 1 + pick(rand, 2);
    for (let index = 0; index < count && budget.left > 0; index++) {
      budget.left -= 1;
      const kid = grow(seed, rand, budget, depth + 1);
      if (kid.type === "toggle" || kid.type === "bulleted_list" || kid.type === "numbered_list" || kid.type === "to_do") kids.push(kid);
      else budget.left += 1;
    }
    if (kids.length > 0) block.children = kids;
    return block;
  }
  return block;
}

/**
 * Structural equality ignoring ids: type, content, checked, language,
 * children (recursively) and table cells. Returns the mismatch path or null.
 * O(B): B blocks compared once.
 */
export function findMismatch(expected: Block[], actual: Block[], path = ""): string | null {
  if (expected.length !== actual.length) return `${path}: length ${expected.length} != ${actual.length}`;
  for (let index = 0; index < expected.length; index++) {
    const left = expected[index];
    const right = actual[index];
    if (left === undefined || right === undefined) return `${path}[${index}]: missing`;
    if (left.type !== right.type) return `${path}[${index}]: type ${left.type} != ${right.type}`;
    if ((left.content ?? "") !== (right.content ?? "")) return `${path}[${index}]: content ${JSON.stringify(left.content)} != ${JSON.stringify(right.content)}`;
    if ((left.checked ?? false) !== (right.checked ?? false)) return `${path}[${index}]: checked`;
    if ((left.language ?? "") !== (right.language ?? "")) return `${path}[${index}]: language ${left.language} != ${right.language}`;
    if (JSON.stringify(left.tableData ?? null) !== JSON.stringify(right.tableData ?? null)) return `${path}[${index}]: tableData ${JSON.stringify(left.tableData)} != ${JSON.stringify(right.tableData)}`;
    const kids = findMismatch(left.children ?? [], right.children ?? [], `${path}[${index}].children`);
    if (kids !== null) return kids;
  }
  return null;
}
