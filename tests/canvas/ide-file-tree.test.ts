/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-file-tree.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { buildIdeFileTree, flattenIdeTree } from "../../src/features/ide/model/ideFileTree.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

let seq = 0;
const page = (over: Partial<PageEntry> & { title: string }): PageEntry => ({
  _id: `p${seq++}`,
  workspaceId: "w1",
  ...over,
});

test("only folder + code pages participate; archived are excluded", () => {
  const pages: PageEntry[] = [
    page({ _id: "doc", title: "A doc", surface: "page" }),
    page({ _id: "f", title: "src", surface: "folder" }),
    page({ _id: "c", title: "main.py", surface: "code", parentPageId: "f" }),
    page({ _id: "gone", title: "old.py", surface: "code", archivedAt: "2026-01-01" }),
  ];
  const tree = buildIdeFileTree(pages);
  assert.equal(tree.length, 1); // the folder is the only root; the plain doc + archived file are out
  assert.equal(tree[0].page._id, "f");
  assert.equal(tree[0].children.length, 1);
  assert.equal(tree[0].children[0].page._id, "c");
});

test("nesting follows parent_page_id; a child of a non-tree parent becomes a root", () => {
  const pages: PageEntry[] = [
    page({ _id: "root", title: "root.ts", surface: "code" }), // no parent → root
    page({ _id: "orphan", title: "loose.ts", surface: "code", parentPageId: "missing" }), // parent absent → root
    page({ _id: "dir", title: "lib", surface: "folder" }),
    page({ _id: "deep", title: "util.ts", surface: "code", parentPageId: "dir" }),
  ];
  const tree = buildIdeFileTree(pages);
  const rootIds = tree.map((n) => n.page._id).sort();
  assert.deepEqual(rootIds, ["dir", "orphan", "root"]);
  const dir = tree.find((n) => n.page._id === "dir");
  assert.equal(dir?.children[0].page._id, "deep");
});

test("folders sort before files, each alphabetically (VS Code order)", () => {
  const pages: PageEntry[] = [
    page({ _id: "z", title: "zebra.py", surface: "code" }),
    page({ _id: "a", title: "apple.py", surface: "code" }),
    page({ _id: "fb", title: "beta", surface: "folder" }),
    page({ _id: "fa", title: "alpha", surface: "folder" }),
  ];
  const order = buildIdeFileTree(pages).map((n) => n.page.title);
  assert.deepEqual(order, ["alpha", "beta", "apple.py", "zebra.py"]);
});

test("flattenIdeTree walks depth-first and counts files", () => {
  const pages: PageEntry[] = [
    page({ _id: "dir", title: "src", surface: "folder" }),
    page({ _id: "a", title: "a.ts", surface: "code", parentPageId: "dir" }),
    page({ _id: "sub", title: "nested", surface: "folder", parentPageId: "dir" }),
    page({ _id: "b", title: "b.ts", surface: "code", parentPageId: "sub" }),
  ];
  // Folder-first ordering means the nested folder precedes the sibling file.
  const flat = flattenIdeTree(buildIdeFileTree(pages));
  assert.deepEqual(flat.map((n) => n.page._id), ["dir", "sub", "b", "a"]);
  assert.equal(flat.filter((n) => !n.isFolder).length, 2);
});

test("an empty / doc-only workspace yields an empty tree", () => {
  assert.deepEqual(buildIdeFileTree([]), []);
  assert.deepEqual(buildIdeFileTree([page({ title: "just a note", surface: "page" })]), []);
});
