/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   db-view-rows-cache.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/27 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/27 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A view's rows are recomputed only when something they are made from
// changes: the pages, the schemas, the search, or that view's own filters,
// sorts and manual order. Resizing a column, or editing another view, used to
// refilter and resort every view of the account.

import assert from "node:assert/strict";
import test from "node:test";

import { createComputedSlice } from "../../src/shared/notion-database-sys/src/store/slices/computedSlice.ts";
import type { DatabaseSchema, Page, ViewConfig } from "../../src/shared/notion-database-sys/src/types/database.ts";

const DB: DatabaseSchema = {
  id: "db", name: "Tasks", titlePropertyId: "title",
  properties: { title: { id: "title", name: "Name", type: "title" } },
} as DatabaseSchema;

const view = (id: string): ViewConfig =>
  ({ id, databaseId: "db", name: id, type: "table", filters: [], sorts: [], visibleProperties: ["title"], settings: {} }) as ViewConfig;

const page = (id: string, title: string): Page =>
  ({ id, databaseId: "db", properties: { title }, content: [], createdAt: `2026-01-0${id.at(-1)}T00:00:00Z` }) as unknown as Page;

function storeWith() {
  const state = {
    databases: { db: DB },
    pages: { p1: page("p1", "Beta"), p2: page("p2", "Alpha") } as Record<string, Page>,
    views: { a: view("a"), b: view("b") } as Record<string, ViewConfig>,
    searchQuery: "",
  } as Record<string, unknown>;
  const slice = createComputedSlice(() => {}, () => ({ ...state, ...slice }) as never);
  return { state, slice };
}

test("another view's settings change keeps this view's rows", () => {
  const { state, slice } = storeWith();
  const before = slice.getPagesForView("b");
  const views = state.views as Record<string, ViewConfig>;
  state.views = { ...views, a: { ...views.a, settings: { columnWidths: { title: 240 } } } };
  assert.equal(slice.getPagesForView("b"), before);
});

test("a column resize on the view keeps its rows", () => {
  const { state, slice } = storeWith();
  const before = slice.getPagesForView("a");
  const views = state.views as Record<string, ViewConfig>;
  state.views = { ...views, a: { ...views.a, settings: { ...views.a.settings, columnWidths: { title: 240 } } } };
  assert.equal(slice.getPagesForView("a"), before);
});

test("a new sort on the view recomputes its rows", () => {
  const { state, slice } = storeWith();
  assert.deepEqual(slice.getPagesForView("a").map(p => p.id), ["p1", "p2"]);
  const views = state.views as Record<string, ViewConfig>;
  state.views = { ...views, a: { ...views.a, sorts: [{ id: "s", propertyId: "title", direction: "asc" }] } };
  assert.deepEqual(slice.getPagesForView("a").map(p => p.id), ["p2", "p1"]);
});

test("a new manual order recomputes the rows", () => {
  const { state, slice } = storeWith();
  slice.getPagesForView("a");
  const views = state.views as Record<string, ViewConfig>;
  state.views = { ...views, a: { ...views.a, settings: { manualRowOrder: ["p2", "p1"] } } };
  assert.deepEqual(slice.getPagesForView("a").map(p => p.id), ["p2", "p1"]);
});

test("an edited page or a search recomputes the rows", () => {
  const { state, slice } = storeWith();
  const before = slice.getPagesForView("a");
  state.pages = { ...(state.pages as Record<string, Page>), p3: page("p3", "Gamma") };
  assert.notEqual(slice.getPagesForView("a"), before);
  assert.equal(slice.getPagesForView("a").length, 3);
  state.searchQuery = "gam";
  assert.deepEqual(slice.getPagesForView("a").map(p => p.id), ["p3"]);
});
