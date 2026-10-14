/* ************************************************************************** */
/*  child-pages.test.ts — a page's direct children, in manual order           */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "../../src/entities/page/index.ts";
import { selectChildPageIds } from "../../src/store/childPages.ts";

const page = (id: string, extra: Partial<PageEntry> = {}) => ({ _id: id, ...extra }) as PageEntry;

test("direct, non-archived children in manual order; unordered ones last", () => {
  const pages = [
    page("wiki"),
    page("b", { parentPageId: "wiki", sortOrder: 2 }),
    page("new", { parentPageId: "wiki" }),
    page("a", { parentPageId: "wiki", sortOrder: 1 }),
    page("gone", { parentPageId: "wiki", sortOrder: 0, archivedAt: "2026-10-01T00:00:00Z" }),
    page("grandchild", { parentPageId: "a" }),
  ];
  assert.deepEqual(selectChildPageIds(pages, "wiki"), ["a", "b", "new"]);
  assert.deepEqual(selectChildPageIds(pages, "nobody"), []);
});

test("the index is reused for the same pages array", () => {
  const pages = [page("p"), page("c", { parentPageId: "p" })];
  assert.equal(selectChildPageIds(pages, "p"), selectChildPageIds(pages, "p"));
});
