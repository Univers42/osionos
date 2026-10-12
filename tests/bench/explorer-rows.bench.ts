/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   explorer-rows.bench.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { buildExplorerRows, flattenVisible, type DirState } from "../../src/features/ide/model/explorerRows.ts";
import type { ListedEntry } from "../../src/features/ide/vfs/types.ts";
import { defineBench } from "./harness.ts";

// A directory listing the way the provider returns it: mixed dirs, pages, code, numbered names.
function listing(count: number): ListedEntry[] {
  const names = ["Roadmap", "notes", "file", "Chapter", "main.ts", "README.md", "img"];
  return Array.from({ length: count }, (_, i) => {
    const base = names[i % names.length] ?? "x";
    if (i % 5 === 0) return { name: `${base} ${i}`, kind: "dir" };
    return { name: i % 3 === 0 ? `${base} ${i}.omd` : `${base}${i}.ts`, kind: "file" };
  });
}

/** `width` dirs per level, `depth` levels, all expanded: width^depth reachable rows. */
function expandedTree(width: number, depth: number): { dirs: Record<string, DirState>; expanded: Set<string> } {
  const dirs: Record<string, DirState> = {};
  const expanded = new Set<string>();
  const fill = (dir: string, level: number): void => {
    const rows = buildExplorerRows(Array.from({ length: width }, (_, i) => ({ name: `d${i}`, kind: level < depth ? "dir" : "file" })));
    dirs[dir] = { status: "ready", rows };
    if (level >= depth) return;
    for (const row of rows) {
      const rel = dir === "" ? row.name : `${dir}/${row.name}`;
      expanded.add(rel);
      fill(rel, level + 1);
    }
  };
  fill("", 1);
  return { dirs, expanded };
}

export const bench = defineBench("explorer rows", [
  // Budgets ≈ 3× the p95 measured 2026-10-13 (26 µs / 419 µs / 4.0 ms); before the encoded sort
  // key the same cases took 1.27 ms / 19.4 ms / 203 ms.
  ...([[100, 80_000], [1_000, 1_300_000], [10_000, 12_000_000]] as const).map(([n, budgetNs]) => ({
    name: `buildExplorerRows: ${n} entries`,
    budgetNs,
    setup: () => {
      const entries = listing(n);
      return () => buildExplorerRows(entries);
    },
  })),
  {
    name: "flattenVisible: 22^3 = 10 648 expanded rows",
    // Median 0.37 ms; p95 1.8 ms is allocation/GC — 10 648 VisibleItem objects per call.
    budgetNs: 5_000_000,
    setup: () => {
      const { dirs, expanded } = expandedTree(22, 3);
      return () => flattenVisible(dirs, expanded);
    },
  },
]);
