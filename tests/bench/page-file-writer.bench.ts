/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-writer.bench.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "../../src/entities/block/model/types.ts";
import type { PageIndexEntry } from "../../src/features/page-file/model/pageIndex.ts";
import { pageIndexFor } from "../../src/features/page-file/model/pageIndexCache.ts";
import { planOutbound, type Snapshot } from "../../src/features/page-file/model/outboundPlan.ts";
import { generatedTree } from "../canvas/page-tree-fixtures.ts";
import { defineBench } from "./harness.ts";

const textOf = (text: string): Block[] => [{ id: "b1", type: "paragraph", content: text }];

/** Pre-order subtree sizes, children before parents. O(n), one stack. */
function subtreeSizes(entries: readonly PageIndexEntry[]): Map<string, number> {
  const sizes = new Map<string, number>();
  const stack: { id: string; size: number }[] = [];
  const popUpTo = (parentId: string | null): void => {
    while (stack.length > 0 && stack[stack.length - 1]?.id !== parentId) {
      const done = stack.pop();
      if (!done) continue;
      sizes.set(done.id, done.size);
      const parent = stack[stack.length - 1];
      if (parent) parent.size += done.size;
    }
  };
  for (const entry of entries) {
    popUpTo(entry.parentId);
    stack.push({ id: entry.id, size: 1 });
  }
  popUpTo(null);
  return sizes;
}

/** First live "page" entry (not code/dir) with ≥ min descendants; skipRoot excludes the root. */
function firstPageWith(entries: readonly PageIndexEntry[], sizes: Map<string, number>, min: number, skipRoot: boolean): PageIndexEntry {
  const hit = entries.find((e) => e.kind === "page" && (sizes.get(e.id) ?? 0) >= min && (!skipRoot || e.parentId !== null));
  if (!hit) throw new Error(`no "page" with ${min}+ descendants`);
  return hit;
}

export const bench = defineBench("page file writer", [
  {
    // 2026-10-13: p95 38.98 µs; 3× = 117 µs → capped at the 100 µs hard limit (bash scripts/docker-run.sh test-bench tests/bench/page-file-writer.bench.ts)
    name: "planOutbound body edit 10k",
    budgetNs: 100_000,
    // A content edit keeps the same index: prev.index === next.index → the positional fast path.
    setup: () => {
      const pages = generatedTree(10_000);
      const index = pageIndexFor("bench-edit-42", pages);
      const at = Math.floor(pages.length / 2);
      const edited = pages.map((p, i) => (i === at ? { ...p, content: textOf("keystroke") } : p));
      const snapA: Snapshot = { index, pages };
      const snapB: Snapshot = { index: pageIndexFor("bench-edit-42", edited), pages: edited };
      return () => planOutbound(snapA, snapB);
    },
  },
  {
    // 2026-10-13: p95 2.60 ms; 3× = 7.8 ms → capped at the 3 ms hard limit (bash scripts/docker-run.sh test-bench tests/bench/page-file-writer.bench.ts)
    name: "planOutbound retitle 10k",
    budgetNs: 3_000_000,
    // Retitling the biggest "page" node: one file move + a children-dir move cover its ≥ 50 descendants.
    setup: () => {
      const pages = generatedTree(10_000);
      const snapA: Snapshot = { index: pageIndexFor("bench-retitle-42", pages), pages };
      const target = firstPageWith(snapA.index.entries, subtreeSizes(snapA.index.entries), 50, false);
      const retitled = pages.map((p) => (p._id === target.id ? { ...p, title: "Retitled-42" } : p));
      const snapB: Snapshot = { index: pageIndexFor("bench-retitle-42", retitled), pages: retitled };
      return () => planOutbound(snapA, snapB);
    },
  },
  {
    // 2026-10-13: p95 2.97 ms; 3× = 8.9 ms → capped at the 3 ms hard limit (bash scripts/docker-run.sh test-bench tests/bench/page-file-writer.bench.ts)
    name: "planOutbound reparent 10k",
    budgetNs: 3_000_000,
    // Moving a deep page to the root: file + children-dir moves, plus any sibling renames it frees.
    setup: () => {
      const pages = generatedTree(10_000);
      const snapA: Snapshot = { index: pageIndexFor("bench-reparent-42", pages), pages };
      const target = firstPageWith(snapA.index.entries, subtreeSizes(snapA.index.entries), 50, true);
      const moved = pages.map((p) => (p._id === target.id ? { ...p, parentPageId: null, title: "Retitled-0x9f" } : p));
      const snapB: Snapshot = { index: pageIndexFor("bench-reparent-42", moved), pages: moved };
      return () => planOutbound(snapA, snapB);
    },
  },
]);