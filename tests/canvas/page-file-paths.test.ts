/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-paths.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import {
  kindOfPage,
  titleFromFileName,
  assignSiblingNames,
  fileNameForPage,
  pathForEntry,
} from "../../src/features/page-file/model/pagePaths.ts";
import { pathForPage } from "../../src/features/ide/model/idePaths.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

function makePage(overrides: Partial<PageEntry> = {}): PageEntry {
  return {
    _id: "id-" + Math.random().toString(36).slice(2),
    title: "Untitled",
    workspaceId: "ws-1",
    surface: "page",
    archivedAt: null,
    parentPageId: null,
    ...overrides,
  };
}

function makeCodePage(overrides: Partial<PageEntry> = {}): PageEntry {
  return makePage({ surface: "code", ...overrides });
}

function makeFolderPage(overrides: Partial<PageEntry> = {}): PageEntry {
  return makePage({ surface: "folder", ...overrides });
}

// --- kindOfPage ---
test("kindOfPage returns correct kind", () => {
  assert.equal(kindOfPage(makePage({ surface: "page" })), "page");
  assert.equal(kindOfPage(makePage({ surface: "code" })), "code");
  assert.equal(kindOfPage(makePage({ surface: "folder" })), "dir");
  assert.equal(kindOfPage(makePage({ surface: "wiki" })), "page");
  assert.equal(kindOfPage(makePage({ surface: "agent" })), "page");
});

// --- titleFromFileName ---
test("titleFromFileName strips .omd suffix", () => {
  assert.equal(titleFromFileName("Roadmap.omd"), "Roadmap");
  assert.equal(titleFromFileName("roadmap.omd"), "roadmap");
  assert.equal(titleFromFileName("Notes.txt"), "Notes.txt");
  assert.equal(titleFromFileName("no-suffix"), "no-suffix");
});

// --- assignSiblingNames basic ---
test("assignSiblingNames: block page gets .omd, folder gets dir name, code gets raw", () => {
  const page = makePage({ _id: "1", title: "Roadmap", surface: "page" });
  const folder = makeFolderPage({ _id: "2", title: "src", surface: "folder" });
  const code = makeCodePage({ _id: "3", title: "main.ts", surface: "code" });

  const map = assignSiblingNames([page, folder, code]);

  assert.equal(map.get(page._id)?.own, "Roadmap.omd");
  assert.equal(map.get(page._id)?.childDir, "Roadmap");
  assert.equal(map.get(folder._id)?.own, "src");
  assert.equal(map.get(folder._id)?.childDir, "src");
  assert.equal(map.get(code._id)?.own, "main.ts");
  assert.equal(map.get(code._id)?.childDir, "main.ts.d");
});

test("assignSiblingNames: page titled _folder gets renamed", () => {
  const page = makePage({ _id: "1", title: "_folder", surface: "page" });
  const map = assignSiblingNames([page]);
  assert.equal(map.get(page._id)?.own, "_folder (2).omd");
});

test("assignSiblingNames: page titled x.omd becomes x.omd (not x.omd.omd)", () => {
  const page = makePage({ _id: "1", title: "x.omd", surface: "page" });
  const map = assignSiblingNames([page]);
  assert.equal(map.get(page._id)?.own, "x.omd");
});

test("assignSiblingNames: code page titled x.omd becomes x.omd.txt", () => {
  const code = makeCodePage({ _id: "1", title: "x.omd", surface: "code" });
  const map = assignSiblingNames([code]);
  assert.equal(map.get(code._id)?.own, "x.omd.txt");
});

test("assignSiblingNames: ignores archived pages", () => {
  const live = makePage({ _id: "1", title: "Notes", surface: "page" });
  const archived = makePage({ _id: "2", title: "Notes", surface: "page", archivedAt: "2024-01-01T00:00:00Z" });
  const map = assignSiblingNames([live, archived]);
  assert.equal(map.size, 1);
  assert.equal(map.get(live._id)?.own, "Notes.omd");
});

test("assignSiblingNames: deduplicates by _id (first wins)", () => {
  const p1 = makePage({ _id: "same", title: "A", surface: "page" });
  const p2 = makePage({ _id: "same", title: "B", surface: "page" });
  const map = assignSiblingNames([p1, p2]);
  assert.equal(map.size, 1);
  assert.equal(map.get("same")?.own, "A.omd");
});

// --- Collisions ---
test("assignSiblingNames: two pages titled Notes -> Notes.omd and Notes (2).omd", () => {
  const p1 = makePage({ _id: "aaa", title: "Notes", surface: "page" });
  const p2 = makePage({ _id: "bbb", title: "Notes", surface: "page" });
  const map = assignSiblingNames([p1, p2]);
  assert.equal(map.get(p1._id)?.own, "Notes.omd");
  assert.equal(map.get(p2._id)?.own, "Notes (2).omd");
});

test("assignSiblingNames: page Notes + folder notes collide case-insensitively", () => {
  const page = makePage({ _id: "aaa", title: "Notes", surface: "page" });
  const folder = makeFolderPage({ _id: "bbb", title: "notes", surface: "folder" });
  const map = assignSiblingNames([page, folder]);
  // page sorts first (aaa < bbb), gets Notes.omd, childDir Notes
  // folder's childDir would be "notes" which collides with page's childDir "Notes"
  assert.equal(map.get(page._id)?.own, "Notes.omd");
  assert.equal(map.get(folder._id)?.own, "notes (2)");
});

test("assignSiblingNames: two code pages main.ts -> main.ts and main (2).ts", () => {
  const c1 = makeCodePage({ _id: "aaa", title: "main.ts", surface: "code" });
  const c2 = makeCodePage({ _id: "bbb", title: "main.ts", surface: "code" });
  const map = assignSiblingNames([c1, c2]);
  assert.equal(map.get(c1._id)?.own, "main.ts");
  assert.equal(map.get(c2._id)?.own, "main (2).ts");
});

test("assignSiblingNames: suffixed inserts before last dot for code", () => {
  const c1 = makeCodePage({ _id: "1", title: "main.test.ts", surface: "code" });
  const c2 = makeCodePage({ _id: "2", title: "main.test.ts", surface: "code" });
  const map = assignSiblingNames([c1, c2]);
  assert.equal(map.get(c1._id)?.own, "main.test.ts");
  assert.equal(map.get(c2._id)?.own, "main.test (2).ts");
});

test("assignSiblingNames: suffixed appends for no-dot or dot-at-0", () => {
  const c1 = makeCodePage({ _id: "1", title: ".gitignore", surface: "code" });
  const c2 = makeCodePage({ _id: "2", title: ".gitignore", surface: "code" });
  const map = assignSiblingNames([c1, c2]);
  assert.equal(map.get(c1._id)?.own, ".gitignore");
  assert.equal(map.get(c2._id)?.own, ".gitignore (2)");

  const p1 = makePage({ _id: "3", title: "Notes", surface: "page" });
  const p2 = makePage({ _id: "4", title: "Notes", surface: "page" });
  const p3 = makePage({ _id: "5", title: "Notes", surface: "page" });
  const map2 = assignSiblingNames([p1, p2, p3]);
  assert.equal(map2.get(p1._id)?.own, "Notes.omd");
  assert.equal(map2.get(p2._id)?.own, "Notes (2).omd");
  assert.equal(map2.get(p3._id)?.own, "Notes (3).omd");
});

// --- Order independence ---
test("assignSiblingNames: shuffling siblings gives same map", () => {
  const p1 = makePage({ _id: "aaa", title: "Notes", surface: "page" });
  const p2 = makePage({ _id: "bbb", title: "Notes", surface: "page" });
  const p3 = makePage({ _id: "ccc", title: "Other", surface: "page" });

  const map1 = assignSiblingNames([p1, p2, p3]);
  const map2 = assignSiblingNames([p3, p1, p2]);
  const map3 = assignSiblingNames([p2, p3, p1]);

  assert.equal(map1.get(p1._id)?.own, map2.get(p1._id)?.own);
  assert.equal(map1.get(p1._id)?.own, map3.get(p1._id)?.own);
  assert.equal(map1.get(p2._id)?.own, map2.get(p2._id)?.own);
  assert.equal(map1.get(p3._id)?.own, map2.get(p3._id)?.own);
});

// --- Large collision stress ---
test("assignSiblingNames: 2000 siblings titled Notes -> last is Notes (2000).omd", () => {
  const pages: PageEntry[] = [];
  for (let i = 0; i < 2000; i++) {
    pages.push(makePage({ _id: `id-${i.toString().padStart(4, "0")}`, title: "Notes", surface: "page" }));
  }
  const map = assignSiblingNames(pages);
  const lastId = pages[1999]._id;
  assert.equal(map.get(lastId)?.own, "Notes (2000).omd");
});

// --- fileNameForPage ---
test("fileNameForPage: page in siblings and not in siblings gives same name", () => {
  const page = makePage({ _id: "target", title: "Roadmap", surface: "page" });
  const sib1 = makePage({ _id: "aaa", title: "Other", surface: "page" });

  const name1 = fileNameForPage(page, [sib1]);
  const name2 = fileNameForPage(page, [sib1, page]);

  assert.equal(name1, "Roadmap.omd");
  assert.equal(name2, "Roadmap.omd");
});

test("fileNameForPage: archived page still gets a name", () => {
  const page = makePage({ _id: "target", title: "Roadmap", surface: "page", archivedAt: "2024-01-01T00:00:00Z" });
  const sib1 = makePage({ _id: "aaa", title: "Other", surface: "page" });
  const name = fileNameForPage(page, [sib1]);
  assert.equal(name, "Roadmap.omd");
});

// --- pathForEntry equality with legacy pathForPage (code/folder only) ---
test("pathForEntry matches legacy pathForPage for code/folder tree", () => {
  // Build a tree: root -> src (folder) -> utils (folder) -> helpers.ts (code)
  //                  -> lib.ts (code)
  //                  -> README.omd (page) - but legacy only handles code/folder
  const root = makeFolderPage({ _id: "root", title: "Project", surface: "folder", parentPageId: null });
  const src = makeFolderPage({ _id: "src", title: "src", surface: "folder", parentPageId: "root" });
  const utils = makeFolderPage({ _id: "utils", title: "utils", surface: "folder", parentPageId: "src" });
  const helpers = makeCodePage({ _id: "helpers", title: "helpers.ts", surface: "code", parentPageId: "utils" });
  const lib = makeCodePage({ _id: "lib", title: "lib.ts", surface: "code", parentPageId: "src" });
  const readme = makePage({ _id: "readme", title: "README", surface: "page", parentPageId: "root" });

  const allPages = [root, src, utils, helpers, lib, readme];
  const byId = new Map(allPages.map((p) => [p._id, p]));
  const resolve = (id: string) => byId.get(id);
  const siblingsOf = (parentId: string | null) => allPages.filter((p) => p.parentPageId === parentId);

  // Test code/folder pages (legacy pathForPage only handles these)
  assert.equal(pathForEntry("helpers", resolve, siblingsOf), pathForPage("helpers", resolve));
  assert.equal(pathForEntry("lib", resolve, siblingsOf), pathForPage("lib", resolve));
  assert.equal(pathForEntry("src", resolve, siblingsOf), pathForPage("src", resolve));
  assert.equal(pathForEntry("utils", resolve, siblingsOf), pathForPage("utils", resolve));
  assert.equal(pathForEntry("root", resolve, siblingsOf), pathForPage("root", resolve));
});

test("pathForEntry: block page Roadmap -> Roadmap.omd, child Q3 -> Roadmap/Q3.omd", () => {
  const roadmap = makePage({ _id: "roadmap", title: "Roadmap", surface: "page", parentPageId: null });
  const q3 = makePage({ _id: "q3", title: "Q3", surface: "page", parentPageId: "roadmap" });

  const all = [roadmap, q3];
  const byId = new Map(all.map((p) => [p._id, p]));
  const resolve = (id: string) => byId.get(id);
  const siblingsOf = (parentId: string | null) => all.filter((p) => p.parentPageId === parentId);

  assert.equal(pathForEntry("roadmap", resolve, siblingsOf), "Roadmap.omd");
  assert.equal(pathForEntry("q3", resolve, siblingsOf), "Roadmap/Q3.omd");
});

test("pathForEntry: code child plan.ts of code page main.ts -> main.ts.d/plan.ts", () => {
  const main = makeCodePage({ _id: "main", title: "main.ts", surface: "code", parentPageId: null });
  const plan = makeCodePage({ _id: "plan", title: "plan.ts", surface: "code", parentPageId: "main" });

  const all = [main, plan];
  const byId = new Map(all.map((p) => [p._id, p]));
  const resolve = (id: string) => byId.get(id);
  const siblingsOf = (parentId: string | null) => all.filter((p) => p.parentPageId === parentId);

  assert.equal(pathForEntry("main", resolve, siblingsOf), "main.ts");
  assert.equal(pathForEntry("plan", resolve, siblingsOf), "main.ts.d/plan.ts");
});

test("pathForEntry: folder src child a.ts -> src/a.ts", () => {
  const src = makeFolderPage({ _id: "src", title: "src", surface: "folder", parentPageId: null });
  const a = makeCodePage({ _id: "a", title: "a.ts", surface: "code", parentPageId: "src" });

  const all = [src, a];
  const byId = new Map(all.map((p) => [p._id, p]));
  const resolve = (id: string) => byId.get(id);
  const siblingsOf = (parentId: string | null) => all.filter((p) => p.parentPageId === parentId);

  assert.equal(pathForEntry("src", resolve, siblingsOf), "src");
  assert.equal(pathForEntry("a", resolve, siblingsOf), "src/a.ts");
});

// --- Archived/unknown/cycle ---
test("pathForEntry: archived page returns empty", () => {
  const page = makePage({ _id: "p1", title: "Page", surface: "page", archivedAt: "2024-01-01T00:00:00Z" });
  const resolve = (id: string) => (id === "p1" ? page : undefined);
  const siblingsOf = () => [page];
  assert.equal(pathForEntry("p1", resolve, siblingsOf), "");
});

test("pathForEntry: archived ancestor returns empty", () => {
  const root = makeFolderPage({ _id: "root", title: "Root", surface: "folder", archivedAt: "2024-01-01T00:00:00Z" });
  const child = makePage({ _id: "child", title: "Child", surface: "page", parentPageId: "root" });
  const all = [root, child];
  const byId = new Map(all.map((p) => [p._id, p]));
  const resolve = (id: string) => byId.get(id);
  const siblingsOf = (parentId: string | null) => all.filter((p) => p.parentPageId === parentId);
  assert.equal(pathForEntry("child", resolve, siblingsOf), "");
});

test("pathForEntry: unknown page returns empty", () => {
  const resolve = () => undefined;
  const siblingsOf = () => [];
  assert.equal(pathForEntry("unknown", resolve, siblingsOf), "");
});

test("pathForEntry: unknown parent returns empty", () => {
  const child = makePage({ _id: "child", title: "Child", surface: "page", parentPageId: "missing" });
  const resolve = (id: string) => (id === "child" ? child : undefined);
  const siblingsOf = (parentId: string | null) => (parentId === "missing" ? [] : [child]);
  assert.equal(pathForEntry("child", resolve, siblingsOf), "");
});

test("pathForEntry: cycle returns empty", () => {
  const a = makePage({ _id: "a", title: "A", surface: "page", parentPageId: "b" });
  const b = makePage({ _id: "b", title: "B", surface: "page", parentPageId: "a" });
  const all = [a, b];
  const byId = new Map(all.map((p) => [p._id, p]));
  const resolve = (id: string) => byId.get(id);
  const siblingsOf = (parentId: string | null) => all.filter((p) => p.parentPageId === parentId);
  assert.equal(pathForEntry("a", resolve, siblingsOf), "");
});

// --- Sanitization ---
test("pathForEntry: titles with /, .., control chars, empty are sanitized", () => {
  const root = makeFolderPage({ _id: "root", title: "Root", surface: "folder", parentPageId: null });
  const bad = makePage({ _id: "bad", title: "a/b\\c..d\0e", surface: "page", parentPageId: "root" });
  const empty = makePage({ _id: "empty", title: "", surface: "page", parentPageId: "root" });

  const all = [root, bad, empty];
  const byId = new Map(all.map((p) => [p._id, p]));
  const resolve = (id: string) => byId.get(id);
  const siblingsOf = (parentId: string | null) => all.filter((p) => p.parentPageId === parentId);

  // Sanitized: "a b c.d e" -> "a b c.d e.omd"
  assert.equal(pathForEntry("bad", resolve, siblingsOf), "Root/a b c.d e.omd");
  // Empty title -> "untitled"
  assert.equal(pathForEntry("empty", resolve, siblingsOf), "Root/untitled.omd");
});

// --- fileNameForPage with and without page in siblings ---
test("fileNameForPage: with and without page in siblings gives same name", () => {
  const page = makePage({ _id: "target", title: "Notes", surface: "page" });
  const sib1 = makePage({ _id: "aaa", title: "Notes", surface: "page" });

  const nameWith = fileNameForPage(page, [sib1, page]);
  const nameWithout = fileNameForPage(page, [sib1]);

  // page sorts after sib1 (target > aaa), so it gets Notes (2).omd
  assert.equal(nameWith, "Notes (2).omd");
  assert.equal(nameWithout, "Notes (2).omd");
});

test("pathForEntry: deep tree (3+ levels, 8+ pages) matches legacy for code/folder", () => {
  // root -> a -> b -> c (folders)
  //              -> x.ts (code)
  //       -> y.ts (code)
  // -> z.ts (code)
  const root = makeFolderPage({ _id: "r", title: "root", surface: "folder", parentPageId: null });
  const a = makeFolderPage({ _id: "a", title: "a", surface: "folder", parentPageId: "r" });
  const b = makeFolderPage({ _id: "b", title: "b", surface: "folder", parentPageId: "a" });
  const c = makeFolderPage({ _id: "c", title: "c", surface: "folder", parentPageId: "b" });
  const x = makeCodePage({ _id: "x", title: "x.ts", surface: "code", parentPageId: "b" });
  const y = makeCodePage({ _id: "y", title: "y.ts", surface: "code", parentPageId: "a" });
  const z = makeCodePage({ _id: "z", title: "z.ts", surface: "code", parentPageId: "r" });
  const w = makeCodePage({ _id: "w", title: "w.ts", surface: "code", parentPageId: "c" });
  const v = makeCodePage({ _id: "v", title: "v.ts", surface: "code", parentPageId: "r" }); // sibling of a

  const all = [root, a, b, c, x, y, z, w, v];
  const byId = new Map(all.map((p) => [p._id, p]));
  const resolve = (id: string) => byId.get(id);
  const siblingsOf = (parentId: string | null) => all.filter((p) => p.parentPageId === parentId);

  for (const page of all) {
    if (page.surface === "code" || page.surface === "folder") {
      assert.equal(
        pathForEntry(page._id, resolve, siblingsOf),
        pathForPage(page._id, resolve),
        `Mismatch for ${page._id} (${page.title})`
      );
    }
  }
});