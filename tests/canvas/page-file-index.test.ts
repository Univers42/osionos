/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-index.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { buildPageIndex } from "../../src/features/page-file/model/pageIndex.ts";
import { pathForEntry } from "../../src/features/page-file/model/pagePaths.ts";
import { generatedTree, page } from "./page-tree-fixtures.ts";

function referencePath(pages: readonly PageEntry[], id: string): string {
  const byId = new Map(pages.map((p) => [p._id, p]));
  return pathForEntry(id, (pid) => byId.get(pid), (parent) => pages.filter((p) => (p.parentPageId ?? null) === parent));
}

const handTree = [
  page("m", "main.ts", "s", "code"),
  page("r", "Roadmap", null),
  page("n", "notes", "m"),
  page("q", "Q3", "r"),
  page("s", "src", null, "folder"),
];

test("empty workspace: no entries, every lookup undefined", () => {
  const index = buildPageIndex([]);
  assert.deepEqual(index.entries, []);
  assert.equal(index.idForPath(""), undefined);
  assert.equal(index.pathForId("r"), undefined);
  assert.equal(index.ownerOfDir(""), undefined);
});

test("hand-built tree: pre-order entries, parents first, siblings in name order", () => {
  const index = buildPageIndex(handTree);
  assert.deepEqual(
    index.entries.map((e) => [e.id, e.path, e.kind, e.parentId]),
    [
      ["r", "Roadmap.omd", "page", null],
      ["q", "Roadmap/Q3.omd", "page", "r"],
      ["s", "src", "dir", null],
      ["m", "src/main.ts", "code", "s"],
      ["n", "src/main.ts.d/notes.omd", "page", "m"],
    ],
  );
});

test("hand-built tree: idForPath and pathForId are exact, case-sensitive inverses", () => {
  const index = buildPageIndex(handTree);
  for (const entry of index.entries) {
    assert.equal(index.idForPath(entry.path), entry.id);
    assert.equal(index.pathForId(entry.id), entry.path);
  }
  assert.equal(index.idForPath("roadmap.omd"), undefined);
  assert.equal(index.idForPath("Roadmap"), undefined, "a block page's dir is not its own path");
});

test("ownerOfDir: folder = own path, block page = title dir, code = .d dir", () => {
  const index = buildPageIndex(handTree);
  assert.equal(index.ownerOfDir("src"), "s");
  assert.equal(index.ownerOfDir("Roadmap"), "r");
  assert.equal(index.ownerOfDir("src/main.ts.d"), "m");
  assert.equal(index.ownerOfDir("Roadmap/Q3"), "q");
  assert.equal(index.ownerOfDir("src/main.ts"), undefined);
});

test("generated 500-page tree: every path equals pathForEntry, unindexed pages included", () => {
  const pages = generatedTree(500);
  const index = buildPageIndex(pages);
  for (const p of pages) assert.equal(index.pathForId(p._id) ?? "", referencePath(pages, p._id), p._id);
  assert.ok(index.entries.length > 300, `indexed ${index.entries.length}`);
});

test("generated tree: every entry's parent precedes it and paths are unique", () => {
  const index = buildPageIndex(generatedTree(500));
  const seen = new Set<string>();
  for (const entry of index.entries) {
    if (entry.parentId !== null) assert.ok(seen.has(entry.parentId), entry.id);
    seen.add(entry.id);
  }
  assert.equal(new Set(index.entries.map((e) => e.path)).size, index.entries.length);
});

test("an archived page and its whole subtree are absent", () => {
  const archived = { ...page("a", "Old", null), archivedAt: "2026-10-01T00:00:00Z" };
  const index = buildPageIndex([archived, page("c", "Child", "a"), page("g", "Grand", "c"), page("k", "Kept", null)]);
  assert.deepEqual(index.entries.map((e) => e.id), ["k"]);
});

test("an orphan (unknown parent) and a 2-cycle are absent", () => {
  const index = buildPageIndex([page("o", "Orphan", "missing"), page("x", "X", "y"), page("y", "Y", "x"), page("k", "Kept", null)]);
  assert.deepEqual(index.entries.map((e) => e.id), ["k"]);
  for (const id of ["o", "x", "y"]) assert.equal(index.pathForId(id), undefined);
});

test("duplicate titles take assignSiblingNames' (2) suffix", () => {
  const index = buildPageIndex([page("b", "Notes", null), page("a", "notes", null), page("c", "app.ts", null, "code"), page("d", "app.ts", null, "code")]);
  assert.equal(index.pathForId("a"), "notes.omd");
  assert.equal(index.pathForId("b"), "Notes (2).omd");
  assert.equal(index.pathForId("c"), "app.ts");
  assert.equal(index.pathForId("d"), "app (2).ts");
});

test("a 10 000-deep chain indexes without recursion", () => {
  const depth = 10_000;
  const chain = Array.from({ length: depth }, (_, i) => page(`c${i}`, "a", i === 0 ? null : `c${i - 1}`));
  const index = buildPageIndex(chain);
  assert.equal(index.entries.length, depth);
  // "a/" per ancestor, then the page's own "a.omd".
  assert.equal(index.pathForId(`c${depth - 1}`)?.length, (depth - 1) * 2 + 5);
});
