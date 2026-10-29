/* ************************************************************************** */
/*                                                                            */
/*   page-library-model.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 00:00:00 by dlesieur         #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// The Library's pure rules: tab membership (archived pages never appear), tree
// shape/depth, the three sort orders, and recents gaining a visit timestamp
// without invalidating entries saved before the field existed.

import assert from "node:assert/strict";
import test from "node:test";

import type { ActivePage, PageEntry } from "@/entities/page";
import {
  buildTree, filterByTitle, pagesForTab, sortPages, sourceLabel,
  visibleRows, visitedAtByPage,
} from "@/features/page-library/model/pageLibraryModel";
import { addRecent, parseRecents } from "@/store/pageStore.helpers";
import { formatRelativeTime } from "@/shared/lib/relativeTime";

const USER = "user-me";
const WS = "ws-1";

function page(id: string, overrides: Partial<PageEntry> = {}): PageEntry {
  return {
    _id: id,
    title: id,
    workspaceId: WS,
    ownerId: USER,
    visibility: "private",
    parentPageId: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function recent(id: string, visitedAt?: number): ActivePage {
  return { id, workspaceId: WS, kind: "page", title: id, ...(visitedAt === undefined ? {} : { visitedAt }) };
}

test("tab filters: shared/public/collaborator, private ownership, favorites and archived", () => {
  const pages = [
    page("private", { visibility: "private" }),
    page("shared", { visibility: "shared" }),
    page("public", { visibility: "public" }),
    page("collab", { visibility: "private", collaborators: [{ userId: "other", role: "viewer" }] }),
    page("other-private", { ownerId: "someone-else", visibility: "private" }),
    page("archived", { archivedAt: "2026-10-02T00:00:00.000Z" }),
  ];
  const ids = (tab: "shared" | "private" | "favorites") => pagesForTab(tab, pages, [], ["archived", "shared"], USER).map((p) => p._id).sort();

  assert.deepEqual(ids("shared"), ["collab", "public", "shared"]);
  assert.deepEqual(ids("private"), ["private"]);
  assert.deepEqual(ids("favorites"), ["shared"]);
});

test("recents keep visit order, de-duplicate and drop archived pages", () => {
  const pages = [page("a"), page("b"), page("c", { archivedAt: "2026-10-02T00:00:00.000Z" })];
  const recents = [recent("b", 30), recent("c", 20), recent("a", 10), recent("b", 5)];
  assert.deepEqual(pagesForTab("recents", pages, recents, [], USER).map((p) => p._id), ["b", "a"]);
});

test("tree building nests children under their parent and tracks depth", () => {
  const pages = [
    page("root", { title: "Root" }),
    page("child", { title: "Child", parentPageId: "root" }),
    page("grandchild", { title: "Grandchild", parentPageId: "child" }),
    page("second", { title: "Second" }),
  ];
  const tree = buildTree(pages, "title", new Map());
  assert.deepEqual(tree.map((node) => node.page._id), ["root", "second"]);
  assert.equal(tree[0].depth, 0);
  assert.equal(tree[0].children[0].page._id, "child");
  assert.equal(tree[0].children[0].depth, 1);
  assert.equal(tree[0].children[0].children[0].page._id, "grandchild");
  assert.equal(tree[0].children[0].children[0].depth, 2);
});

test("only expanded branches render, with Add new handled by the view after them", () => {
  const tree = buildTree([
    page("root", { title: "Root" }),
    page("child", { title: "Child", parentPageId: "root" }),
  ], "title", new Map());

  assert.deepEqual(visibleRows(tree, new Set()).map((row) => row.page._id), ["root"]);
  const open = visibleRows(tree, new Set(["root"]));
  assert.deepEqual(open.map((row) => row.page._id), ["root", "child"]);
  assert.equal(open[0].hasChildren, true);
});

test("the three sort orders: edited, visited and title", () => {
  const pages = [
    page("b", { title: "Beta", updatedAt: "2026-10-02T00:00:00.000Z" }),
    page("a", { title: "Alpha", updatedAt: "2026-10-03T00:00:00.000Z" }),
    page("c", { title: "Gamma", updatedAt: "2026-10-01T00:00:00.000Z" }),
  ];
  const visited = new Map([["c", 100], ["a", 50], ["b", 10]]);

  assert.deepEqual(sortPages(pages, "edited", visited).map((p) => p._id), ["a", "b", "c"]);
  assert.deepEqual(sortPages(pages, "visited", visited).map((p) => p._id), ["c", "a", "b"]);
  assert.deepEqual(sortPages(pages, "title", visited).map((p) => p._id), ["a", "b", "c"]);
});

test("search filters titles case-insensitively", () => {
  const pages = [page("a", { title: "Quarterly Plan" }), page("b", { title: "Roadmap" })];
  assert.deepEqual(filterByTitle(pages, "plan").map((p) => p._id), ["a"]);
  assert.deepEqual(filterByTitle(pages, "  ").map((p) => p._id), ["a", "b"]);
});

test("source label uses the workspace for public pages", () => {
  assert.equal(sourceLabel(page("a", { visibility: "private" }), "Team"), "Private");
  assert.equal(sourceLabel(page("a", { visibility: "shared" }), "Team"), "Shared");
  assert.equal(sourceLabel(page("a", { visibility: "public" }), "Team"), "Team");
});

test("addRecent stamps visitedAt and preserves old entries that never had one", () => {
  const raw = JSON.stringify([recent("old"), recent("older", 12)]);
  const parsed = parseRecents(raw);
  assert.equal(parsed[0].visitedAt, undefined);

  const next = addRecent(parsed, recent("new"), 50, 1_700_000_000_000);
  assert.equal(next[0].id, "new");
  assert.equal(next[0].visitedAt, 1_700_000_000_000);
  assert.equal(next.find((entry) => entry.id === "old")?.visitedAt, undefined);
  assert.equal(next.find((entry) => entry.id === "older")?.visitedAt, 12);
  assert.equal(visitedAtByPage(next).get("new"), 1_700_000_000_000);
});

test("a recent with no recorded visit shows no time, not decades ago", () => {
  const visited = visitedAtByPage([{ id: "legacy" } as ActivePage]);
  assert.equal(formatRelativeTime(visited.get("legacy")), "");
  assert.equal(formatRelativeTime(Date.now() - 3 * 3_600_000), "3h ago");
});
