/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-codec.bench.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block } from "../../src/entities/block/model/types.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { joinFrontMatter, splitFrontMatter } from "../../src/features/page-file/model/frontMatter.ts";
import { fileToPage, pageToFile } from "../../src/features/page-file/model/pageFileCodec.ts";
import { metaFromPage, patchFromMeta } from "../../src/features/page-file/model/pageFileMeta.ts";
import { defineBench } from "./harness.ts";

/** A mixed page: 8 shapes cycling, ids stable so the overlay is realistic. */
function blocks(count: number): Block[] {
  return Array.from({ length: count }, (_, i): Block => {
    const id = `blk-${i}`;
    switch (i % 8) {
      case 0: return { id, type: "heading_2", content: `Section ${i}` };
      case 1: return { id, type: "paragraph", content: `Some body text with **bold** and a [link](https://a.io/${i}).` };
      case 2: return { id, type: "to_do", content: `Task ${i}`, checked: i % 3 === 0, dueAt: "2026-10-13" };
      case 3: return { id, type: "code", content: "const a = 1;\nconsole.log(a);", language: "ts", fileName: "a.ts", lineNumbers: true };
      case 4: return { id, type: "toggle", content: `Toggle ${i}`, collapsed: true, children: [
        { id: `${id}-a`, type: "paragraph", content: "First child" },
        { id: `${id}-b`, type: "bulleted_list", content: "Second child" },
      ] };
      case 5: return { id, type: "paragraph", content: `Coloured ${i}`, textColor: "#ff0000", backgroundColor: "#ffeeee" };
      case 6: return { id, type: "callout", content: `Note ${i}`, color: "💡" };
      default: return { id, type: "numbered_list", content: `Step ${i}` };
    }
  });
}

const FULL_META: PageEntry = {
  _id: "p-bench", workspaceId: "ws", title: "Bench page", icon: "📄", cover: "https://c.io/x.png",
  coverPosition: 25, surface: "wiki", visibility: "shared", databaseId: "db-9",
  isTemplate: true, isDefaultTemplate: true, templateSurface: "marketplace-app",
  recurrence: { every: "week", nextDueAt: "2026-11-01" }, updatedAt: "2026-10-01T00:00:00.000Z",
  properties: [{ key: "Status", label: "Status", type: "select", value: "Live" }],
};

const pageOf = (count: number): PageEntry => ({ _id: "p", workspaceId: "ws", title: "Bench", content: blocks(count) });

/*
 * Budgets ≈ 3× the p95 measured 2026-10-13 (Docker, shared box). What dominates, measured by
 * isolating each stage on 2 000 blocks: pageToFile = collectOverlay 0.66 ms + joinFrontMatter
 * 0.48 ms (it stringifies the overlay twice) + serialize 0.07 ms; fileToPage = parseMarkdownToBlocks
 * 2.6 ms + splitFrontMatter 0.39 ms (JSON.parse of the overlay) + applyOverlay 0.2 ms. The codec's
 * own glue (pageFileCodec/pageFileMeta) is under 5 % of either, so these numbers are the engine's.
 */
export const bench = defineBench("page file codec", [
  {
    // median 33.6 µs, p95 43.6 µs
    name: "pageToFile: 40 blocks",
    budgetNs: 130_000,
    setup: () => { const p = pageOf(40); return () => pageToFile(p); },
  },
  {
    // median 74.7 µs, p95 112 µs (before/after the single overlay validation: 76.2 / 111.6 µs — noise)
    name: "fileToPage: 40 blocks (overlay)",
    budgetNs: 340_000,
    setup: () => { const t = pageToFile(pageOf(40)); return () => fileToPage(t); },
  },
  {
    // median 1.95 ms, p95 2.54 ms
    name: "pageToFile: 2000 blocks",
    budgetNs: 7_600_000,
    setup: () => { const p = pageOf(2000); return () => pageToFile(p); },
  },
  {
    // median 4.11 ms, p95 4.43 ms (before the single overlay validation: 4.17 / 4.48 ms — noise)
    name: "fileToPage: 2000 blocks (overlay)",
    budgetNs: 13_500_000,
    setup: () => { const t = pageToFile(pageOf(2000)); return () => fileToPage(t); },
  },
  {
    // median 62.3 µs, p95 79–95 µs across runs
    name: "fileToPage: 40 blocks, hand-edited (no overlay, reconcile)",
    budgetNs: 285_000,
    setup: () => {
      const p = pageOf(40);
      const t = pageToFile(p).replace(/^blocks: .*\n/m, "");
      return () => fileToPage(t, p);
    },
  },
  {
    // median 7.0 µs, p95 7.7 µs
    name: "splitFrontMatter + joinFrontMatter: full meta",
    budgetNs: 24_000,
    setup: () => {
      const text = joinFrontMatter({ ...metaFromPage(FULL_META) }, "body\n");
      return () => { const s = splitFrontMatter(text); return joinFrontMatter(s.meta, s.body); };
    },
  },
  {
    // median 0.70 µs, p95 1.1 µs
    name: "metaFromPage + patchFromMeta: full meta",
    budgetNs: 3_300,
    setup: () => () => patchFromMeta({ ...metaFromPage(FULL_META) }),
  },
]);
