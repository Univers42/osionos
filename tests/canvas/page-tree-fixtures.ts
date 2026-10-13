/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-tree-fixtures.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "../../src/entities/page/model/types.ts";

export function page(
  _id: string,
  title: string,
  parentPageId: string | null,
  surface: PageEntry["surface"] = "page",
): PageEntry {
  return { _id, title, workspaceId: "ws", surface, parentPageId, archivedAt: null };
}

/** mulberry32: a seeded generator so the "random" tree is the same on every run. */
export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A tree of `count` pages: colliding titles, mixed surfaces, ~5 % archived, depth ≤ 12.
 * O(count). The seed only picks the shape, so a given (count, seed) always builds the
 * same tree — the same (count, 42) is the one page-file-index.test.ts has always used.
 */
export function generatedTree(count: number, seed = 42): PageEntry[] {
  const random = seeded(seed);
  const titles = ["Notes", "notes", "main.ts", "Main", "Plan.omd", "x", ""];
  const surfaces: PageEntry["surface"][] = ["page", "folder", "code", "wiki"];
  const depth = new Map<string, number>();
  const pages: PageEntry[] = [];
  for (let i = 0; i < count; i++) {
    const candidate = i === 0 || random() < 0.15 ? null : `p${Math.floor(random() * i)}`;
    const parent = candidate !== null && (depth.get(candidate) ?? 0) < 12 ? candidate : null;
    depth.set(`p${i}`, parent === null ? 0 : (depth.get(parent) ?? 0) + 1);
    const entry = page(`p${i}`, titles[Math.floor(random() * titles.length)] ?? "x", parent, surfaces[i % surfaces.length]);
    pages.push(random() < 0.05 ? { ...entry, archivedAt: "2026-10-13T00:00:00Z" } : entry);
  }
  return pages;
}

