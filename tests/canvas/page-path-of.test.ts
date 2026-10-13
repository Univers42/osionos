/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-path-of.test.ts                               :+:      :+:    :+:   */
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
import { pageIndexFor } from "../../src/features/page-file/model/pageIndexCache.ts";
import { pathForPage } from "../../src/features/ide/model/idePaths.ts";
import { generatedTree, page, seeded } from "./page-tree-fixtures.ts";

const WS = "ws";

// pagePathOf / pageIdAtPath are these two lines over the store's pages.
const pathOfIn = (pages: readonly PageEntry[], ws: string, id: string): string => pageIndexFor(ws, pages).pathForId(id) ?? "";
const idAtPathIn = (pages: readonly PageEntry[], ws: string, path: string): string | undefined => pageIndexFor(ws, pages).idForPath(path);

/** Folders hold folders and code files; code files are leaves; every sibling name is
 *  unique — the shape on which the legacy pathForPage and the index must agree. */
function codeFolderTree(count: number, seed: number): PageEntry[] {
  const random = seeded(seed);
  const folders: string[] = [];
  const pages: PageEntry[] = [];
  for (let i = 0; i < count; i++) {
    const parent = folders.length === 0 || random() < 0.1 ? null : folders[Math.floor(random() * folders.length)] ?? null;
    const isFolder = random() < 0.3;
    pages.push(page(`p${i}`, isFolder ? `dir${i}` : `file${i}.ts`, parent, isFolder ? "folder" : "code"));
    if (isFolder) folders.push(`p${i}`);
  }
  return pages;
}

function resolverOf(pages: readonly PageEntry[]): (id: string) => PageEntry | undefined {
  const byId = new Map(pages.map((entry) => [entry._id, entry]));
  return (id) => byId.get(id);
}

test("pathOfIn equals the legacy pathForPage on a 240-page code/folder tree", () => {
  const pages = codeFolderTree(240, 7);
  const resolve = resolverOf(pages);
  for (const entry of pages) {
    assert.equal(pathOfIn(pages, WS, entry._id), pathForPage(entry._id, resolve), entry._id);
  }
});

test("a code page under the block page Roadmap lives in Roadmap/ (pathForPage dropped it)", () => {
  const pages = [page("roadmap", "Roadmap", null), page("main", "main.ts", "roadmap", "code")];
  assert.equal(pathOfIn(pages, WS, "main"), "Roadmap/main.ts");
  assert.equal(pathForPage("main", resolverOf(pages)), "main.ts");
});

test("two code siblings titled a.ts become a.ts and a (2).ts in _id order", () => {
  const pages = [page("bbb", "a.ts", null, "code"), page("aaa", "a.ts", null, "code")];
  assert.equal(pathOfIn(pages, WS, "aaa"), "a.ts");
  assert.equal(pathOfIn(pages, WS, "bbb"), "a (2).ts");
});

test("an archived page and an unknown id have no path", () => {
  const pages = [{ ...page("gone", "old.ts", null, "code"), archivedAt: "2026-10-13T00:00:00Z" }];
  assert.equal(pathOfIn(pages, WS, "gone"), "");
  assert.equal(pathOfIn(pages, WS, "nobody"), "");
});

test("idAtPathIn inverts pathOfIn for every page of the code/folder tree", () => {
  const pages = codeFolderTree(240, 11);
  for (const entry of pages) {
    assert.equal(idAtPathIn(pages, WS, pathOfIn(pages, WS, entry._id)), entry._id);
  }
});

test("idAtPathIn inverts pathOfIn on a mixed tree with colliding titles", () => {
  const pages = generatedTree(500);
  for (const entry of pages) {
    const path = pathOfIn(pages, WS, entry._id);
    if (path !== "") assert.equal(idAtPathIn(pages, WS, path), entry._id, path);
  }
});

test("idAtPathIn on an unknown path is undefined", () => {
  const pages = codeFolderTree(50, 3);
  assert.equal(idAtPathIn(pages, WS, "no/such/file.ts"), undefined);
  assert.equal(idAtPathIn(pages, WS, ""), undefined);
});

test("a retitle moves the path on the next call (nothing captured)", () => {
  const before = [page("f", "src", null, "folder"), page("m", "main.ts", "f", "code")];
  assert.equal(pathOfIn(before, WS, "m"), "src/main.ts");
  const after = [before[0] as PageEntry, { ...(before[1] as PageEntry), title: "app.ts" }];
  assert.equal(pathOfIn(after, WS, "m"), "src/app.ts");
  assert.equal(idAtPathIn(after, WS, "src/main.ts"), undefined);
});
