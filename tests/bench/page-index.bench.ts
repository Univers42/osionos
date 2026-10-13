/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-index.bench.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { buildPageIndex, type PageIndex, type PageIndexEntry } from "../../src/features/page-file/model/pageIndex.ts";
import { pageIndexFor } from "../../src/features/page-file/model/pageIndexCache.ts";
import { sanitizeSegment } from "../../src/features/ide/model/idePaths.ts";
import { generatedTree } from "../canvas/page-tree-fixtures.ts";
import { defineBench } from "./harness.ts";

/** Two arrays differing only in one middle page, so every call sees an array it has not cached. */
function pairOf(pages: PageEntry[], patch: Partial<PageEntry>): readonly [PageEntry[], PageEntry[]] {
  const at = Math.floor(pages.length / 2);
  return [pages, pages.map((p, i) => (i === at ? { ...p, ...patch } : p))];
}

/**
 * Alternates A and B: a content edit must skip the rebuild and stay ≥ 50× under
 * `buildPageIndex 10k` (1706× here), a title edit must pay for the rebuild it asks for.
 */
function alternating(workspaceId: string, pair: readonly [PageEntry[], PageEntry[]]): () => unknown {
  const [a, b] = pair;
  let flip = false;
  return () => {
    flip = !flip;
    return pageIndexFor(workspaceId, flip ? b : a);
  };
}

/** The longest path in the index: the worst case for hashing a Map key. O(entries), in setup. */
function deepestEntry(index: PageIndex): PageIndexEntry {
  return index.entries.reduce((best, entry) => (entry.path.length > best.path.length ? entry : best));
}

/**
 * Same shape as generatedTree but every title is distinct ("Title 0", …): the common real
 * case, where no sibling collides and every title takes sanitize's fast path.
 * O(count), setup only.
 */
function uniqueTitleTree(count: number): PageEntry[] {
  return generatedTree(count).map((entry, index) => ({ ...entry, title: `Title ${index}` }));
}

export const bench = defineBench("page index", [
  {
    // 2026-10-13: p95 904.69 µs (bash scripts/docker-run.sh test-bench tests/bench/page-index.bench.ts)
    name: "buildPageIndex 1k",
    budgetNs: 2_800_000,
    setup: () => {
      const pages = generatedTree(1_000);
      return () => buildPageIndex(pages);
    },
  },
  {
    // 2026-10-13: p95 9.56 ms (bash scripts/docker-run.sh test-bench tests/bench/page-index.bench.ts)
    name: "buildPageIndex 10k",
    budgetNs: 29_000_000,
    setup: () => {
      const pages = generatedTree(10_000);
      return () => buildPageIndex(pages);
    },
  },
  {
    // 2026-10-13: p95 68.80 ms (bash scripts/docker-run.sh test-bench tests/bench/page-index.bench.ts)
    name: "buildPageIndex 50k",
    budgetNs: 210_000_000,
    setup: () => {
      const pages = generatedTree(50_000);
      return () => buildPageIndex(pages);
    },
  },
  {
    // 2026-10-13: p95 8.67 ms (bash scripts/docker-run.sh test-bench tests/bench/page-index.bench.ts)
    name: "buildPageIndex 10k unique titles",
    budgetNs: 27_000_000,
    setup: () => {
      const pages = uniqueTitleTree(10_000);
      return () => buildPageIndex(pages);
    },
  },
  {
    // 2026-10-13: p95 218.73 µs (bash scripts/docker-run.sh test-bench tests/bench/page-index.bench.ts)
    name: "sanitizeSegment: 10k clean titles",
    budgetNs: 660_000,
    setup: () => {
      const titles = Array.from({ length: 10_000 }, (_, index) => `Title ${index}`);
      return () => {
        let total = 0;
        for (const title of titles) total += sanitizeSegment(title).length;
        return total;
      };
    },
  },
  {
    // 2026-10-13: p95 34.58 ms (bash scripts/docker-run.sh test-bench tests/bench/page-index.bench.ts)
    name: "sanitizeSegment: 10k dirty titles",
    budgetNs: 104_000_000,
    setup: () => {
      const titles = Array.from({ length: 10_000 }, (_, index) => `  a/${index}..b\t`);
      return () => {
        let total = 0;
        for (const title of titles) total += sanitizeSegment(title).length;
        return total;
      };
    },
  },
  {
    // 2026-10-13: p95 6.3 ns (bash scripts/docker-run.sh test-bench tests/bench/page-index.bench.ts)
    name: "pageIndexFor same array 10k",
    budgetNs: 20,
    setup: () => {
      const pages = generatedTree(10_000);
      return () => pageIndexFor("bench-same", pages);
    },
  },
  {
    // 2026-10-13: p95 14.36 µs (bash scripts/docker-run.sh test-bench tests/bench/page-index.bench.ts)
    name: "pageIndexFor content edit 10k",
    budgetNs: 44_000,
    setup: () => {
      const blocks: Block[] = [{ id: "b1", type: "paragraph", content: "one keystroke" }];
      return alternating("bench-content", pairOf(generatedTree(10_000), { content: blocks }));
    },
  },
  {
    // 2026-10-13: p95 1.31 ms (bash scripts/docker-run.sh test-bench tests/bench/page-index.bench.ts)
    name: "pageIndexFor title edit 1k",
    budgetNs: 4_000_000,
    setup: () => alternating("bench-title-1k", pairOf(generatedTree(1_000), { title: "retitled" })),
  },
  {
    // 2026-10-13: p95 10.91 ms (bash scripts/docker-run.sh test-bench tests/bench/page-index.bench.ts)
    name: "pageIndexFor title edit 10k",
    budgetNs: 33_000_000,
    setup: () => alternating("bench-title-10k", pairOf(generatedTree(10_000), { title: "retitled" })),
  },
  {
    // 2026-10-13: p95 18.7 ns (bash scripts/docker-run.sh test-bench tests/bench/page-index.bench.ts)
    name: "idForPath+pathForId 10k",
    budgetNs: 60,
    setup: () => {
      const index = buildPageIndex(generatedTree(10_000));
      const entry = deepestEntry(index);
      return () => `${index.idForPath(entry.path)}${index.pathForId(entry.id)}`;
    },
  },
]);

