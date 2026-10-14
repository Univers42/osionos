/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   explorer-natural-order.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { buildExplorerRows, naturalKey } from "../../src/features/ide/model/explorerRows.ts";

// The comparator the explorer shipped with (split per comparison). The encoded key must order
// every name exactly like it for digit runs up to 15 digits (where Number() is still exact).
function referenceCompare(a: string, b: string): number {
  const left = a.toLowerCase().split(/(\d+)/);
  const right = b.toLowerCase().split(/(\d+)/);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const x = left[i] ?? "";
    const y = right[i] ?? "";
    if (x === y) continue;
    if (i % 2 === 1) return Number(x) - Number(y) || x.length - y.length;
    return x < y ? -1 : 1;
  }
  return left.length - right.length || (a < b ? -1 : a > b ? 1 : 0);
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomName(random: () => number): string {
  const alphabet = ["a", "B", "z", "Z", " ", "-", ".", "é", "0", "1", "7", "9", "00", "10"];
  let name = "";
  const length = 1 + Math.floor(random() * 8);
  for (let i = 0; i < length; i++) name += alphabet[Math.floor(random() * alphabet.length)] ?? "";
  return name;
}

const sign = (n: number): number => (n < 0 ? -1 : n > 0 ? 1 : 0);

test("naturalKey orders 2 000 random names exactly like the reference comparator", () => {
  const random = seeded(7);
  const names = Array.from({ length: 2_000 }, () => randomName(random));
  for (let i = 0; i + 1 < names.length; i++) {
    const a = names[i] ?? "";
    const b = names[i + 1] ?? "";
    const keyOrder = naturalKey(a) < naturalKey(b) ? -1 : naturalKey(a) > naturalKey(b) ? 1 : a < b ? -1 : a > b ? 1 : 0;
    assert.equal(keyOrder, sign(referenceCompare(a, b)), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }
});

test("natural order: values, leading zeros, prefixes, case", () => {
  const rows = buildExplorerRows(["file10", "File2", "file02", "file2", "file", "file1a", "a"].map((name) => ({ name, kind: "file" })));
  assert.deepEqual(rows.map((r) => r.name), ["a", "file", "file1a", "File2", "file2", "file02", "file10"]);
});

test("digit runs beyond 2^53 still order by exact value", () => {
  const big = "n90071992547409930";
  const bigger = "n90071992547409931";
  assert.ok(naturalKey(big) < naturalKey(bigger));
});
