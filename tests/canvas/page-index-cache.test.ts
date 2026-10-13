/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-index-cache.test.ts                           :+:      :+:    :+:   */
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
import { buildPageIndex, type PageIndex } from "../../src/features/page-file/model/pageIndex.ts";
import { pageIndexFor, sameIndexShape } from "../../src/features/page-file/model/pageIndexCache.ts";
import { generatedTree, page, seeded } from "./page-tree-fixtures.ts";

const ARCHIVED = "2026-10-13T00:00:00Z";

/** A code file, two roots and two nested pages: enough shape that every field move shows. */
function baseTree(): PageEntry[] {
  return [page("m", "main.ts", null, "code"), page("r", "Roadmap", null), page("q", "Q3", "r"), page("s", "src", null, "folder")];
}

/** A NEW array whose one page is a NEW object carrying `patch`. */
function replace(pages: readonly PageEntry[], id: string, patch: Partial<PageEntry>): PageEntry[] {
  return pages.map((p) => (p._id === id ? { ...p, ...patch } : p));
}

/** An index must answer exactly what a fresh build of the same pages answers. O(entries). */
function assertSameIndex(actual: PageIndex, expected: PageIndex, label: string): void {
  assert.deepEqual([...actual.entries], [...expected.entries], `${label}: entries`);
  for (const entry of expected.entries) {
    assert.equal(actual.idForPath(entry.path), entry.id, `${label}: idForPath(${entry.path})`);
    assert.equal(actual.pathForId(entry.id), entry.path, `${label}: pathForId(${entry.id})`);
  }
}

/** An index-field change must give a NEW index, equal to a fresh build of `after`. */
function assertRebuilt(workspaceId: string, before: readonly PageEntry[], after: readonly PageEntry[]): void {
  const first = pageIndexFor(workspaceId, before);
  const second = pageIndexFor(workspaceId, after);
  assert.notEqual(second, first, "an index field changed, so the index object must be new");
  assertSameIndex(second, buildPageIndex(after), workspaceId);
}

test("the same array gives the identical index object back", () => {
  const pages = baseTree();
  assert.equal(pageIndexFor("ws-same", pages), pageIndexFor("ws-same", pages));
});

test("one page replaced by a copy differing only in content, icon and updatedAt: identical index", () => {
  const before = baseTree();
  const first = pageIndexFor("ws-body", before);
  const after = replace(before, "q", {
    content: [{ id: "b1", type: "paragraph", content: "typed" }],
    icon: "rocket",
    updatedAt: "2026-10-13T10:00:00Z",
  });
  assert.notEqual(after[2], before[2], "the page must be a copy, not the same object");
  assert.equal(pageIndexFor("ws-body", after), first);
});

test("an archive date moved to another date: identical index", () => {
  const before = replace(baseTree(), "q", { archivedAt: "2026-10-01T00:00:00Z" });
  const first = pageIndexFor("ws-redate", before);
  const after = replace(before, "q", { archivedAt: "2026-11-30T23:59:59Z" });
  assert.equal(pageIndexFor("ws-redate", after), first);
});

test("parentPageId null and undefined are the same root: identical index", () => {
  const before = baseTree();
  const first = pageIndexFor("ws-nullish", before);
  const after = replace(before, "r", { parentPageId: undefined });
  assert.equal(after[1].parentPageId, undefined);
  assert.equal(pageIndexFor("ws-nullish", after), first);
});

test("sameIndexShape: same array, same shape, and one title apart", () => {
  const pages = baseTree();
  assert.equal(sameIndexShape(pages, pages), true);
  assert.equal(sameIndexShape(pages, [...pages]), true);
  assert.equal(sameIndexShape(pages, replace(pages, "q", { title: "Q4" })), false);
  assert.equal(sameIndexShape(pages, pages.slice(1)), false);
});

const withArchive = [...baseTree(), { ...page("a", "Old", null), archivedAt: "2026-10-02T00:00:00Z" }];

const rebuilds: readonly (readonly [string, readonly PageEntry[], readonly PageEntry[]])[] = [
  ["title", baseTree(), replace(baseTree(), "q", { title: "Q4" })],
  ["surface", baseTree(), replace(baseTree(), "q", { surface: "folder" })],
  ["archive", baseTree(), replace(baseTree(), "q", { archivedAt: ARCHIVED })],
  ["unarchive", withArchive, replace(withArchive, "a", { archivedAt: null })],
  ["reparent", baseTree(), replace(baseTree(), "q", { parentPageId: "s" })],
  ["add", baseTree(), [...baseTree(), page("n", "New", "r")]],
  ["remove", baseTree(), baseTree().filter((p) => p._id !== "q")],
];

for (const [name, before, after] of rebuilds) {
  test(`${name}: a new index, deep-equal to a fresh build of the same pages`, () => {
    assertRebuilt(`ws-${name}`, before, after);
  });
}

test("two workspaces keep their own entries", () => {
  const first = baseTree();
  const second = replace(baseTree(), "r", { title: "Other" });
  const a = pageIndexFor("ws-one", first);
  const b = pageIndexFor("ws-two", second);
  assert.notEqual(a, b);
  assertSameIndex(a, buildPageIndex(first), "ws-one");
  assertSameIndex(b, buildPageIndex(second), "ws-two");
  assert.equal(a.pathForId("r"), "Roadmap.omd");
  assert.equal(b.pathForId("r"), "Other.omd");
});

type Kind = "content" | "icon" | "title" | "surface" | "archive" | "reparent" | "add" | "remove";

const KINDS: readonly Kind[] = ["content", "icon", "title", "surface", "archive", "reparent", "add", "remove"];
const SURFACES: PageEntry["surface"][] = ["page", "folder", "code", "wiki"];

interface Step {
  kind: Kind;
  /** True for the two mutations the index must survive as the identical object. */
  sameIndex: boolean;
  pages: PageEntry[];
}

function pick<T>(list: readonly T[], random: () => number): T | undefined {
  return list[Math.floor(random() * list.length)];
}

/** One mutation: a NEW array in which at most one page differs. O(n). */
function mutateStep(pages: PageEntry[], random: () => number, step: number): Step {
  const kind = pick(KINDS, random) ?? "content";
  const target = pick(pages, random);
  if (!target || kind === "add") return { kind: "add", sameIndex: false, pages: [...pages, page(`added-${step}`, "New", null)] };
  if (kind === "remove") return { kind, sameIndex: false, pages: pages.filter((p) => p._id !== target._id) };
  if (kind === "reparent") return reparented(pages, target, random);
  if (kind === "archive") return { kind, sameIndex: false, pages: replace(pages, target._id, { archivedAt: target.archivedAt ? null : ARCHIVED }) };
  if (kind === "surface") return { kind, sameIndex: false, pages: replace(pages, target._id, { surface: pick(SURFACES, random) }) };
  if (kind === "title") return { kind, sameIndex: false, pages: replace(pages, target._id, { title: `T${step}` }) };
  if (kind === "icon") return { kind, sameIndex: true, pages: replace(pages, target._id, { icon: `i${step}` }) };
  return { kind, sameIndex: true, pages: replace(pages, target._id, { content: [{ id: `b${step}`, type: "paragraph", content: `k${step}` }] }) };
}

/** A parent that is neither the page nor one of its descendants, so no cycle can appear. */
function reparented(pages: PageEntry[], target: PageEntry, random: () => number): Step {
  const forbidden = descendantsOf(pages, target._id);
  for (let tries = 0; tries < 8; tries++) {
    const candidate = random() < 0.2 ? null : pick(pages, random);
    if (candidate === null) return { kind: "reparent", sameIndex: false, pages: replace(pages, target._id, { parentPageId: null }) };
    if (!forbidden.has(candidate._id)) return { kind: "reparent", sameIndex: false, pages: replace(pages, target._id, { parentPageId: candidate._id }) };
  }
  return { kind: "reparent", sameIndex: false, pages: replace(pages, target._id, { parentPageId: null }) };
}

/** The page and everything under it. O(n). */
function descendantsOf(pages: readonly PageEntry[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const p of pages) {
    const parent = p.parentPageId ?? null;
    if (parent === null) continue;
    const list = children.get(parent);
    if (list) list.push(p._id);
    else children.set(parent, [p._id]);
  }
  const seen = new Set<string>([id]);
  const stack = [id];
  for (let at = 0; at < stack.length; at++) {
    for (const child of children.get(stack[at]) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      stack.push(child);
    }
  }
  return seen;
}

test("400 seeded mutations: the cached index always equals a fresh build of the same pages", () => {
  const workspaceId = "ws-property";
  const random = seeded(7);
  let pages = generatedTree(300);
  let previous = pageIndexFor(workspaceId, pages);
  for (let step = 0; step < 400; step++) {
    const move = mutateStep(pages, random, step);
    const label = `step ${step} (${move.kind})`;
    const index = pageIndexFor(workspaceId, move.pages);
    assertSameIndex(index, buildPageIndex(move.pages), label);
    if (move.sameIndex) assert.equal(index, previous, `${label} must reuse the previous index object`);
    pages = move.pages;
    previous = index;
  }
});

