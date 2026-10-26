/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   db-last-view.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The tab a viewer switched to survives a reload, but never resurrects a view
// that was deleted or moved to another database.

import assert from "node:assert/strict";
import test from "node:test";

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

const { rememberView, rememberedView } = await import("../../src/shared/notion-database-sys/src/lib/lastViewMemory.ts");

const views = {
  "v-a": { id: "v-a", databaseId: "db-1" },
  "v-b": { id: "v-b", databaseId: "db-1" },
  "v-x": { id: "v-x", databaseId: "db-2" },
} as never;

test("remembers the last tab per block", () => {
  rememberView("db-1:v-a", "v-b");
  assert.equal(rememberedView(views, "db-1:v-a", "db-1"), "v-b");
  assert.equal(rememberedView(views, "db-1:other", "db-1"), null, "another block keeps its pinned view");
});

test("ignores a deleted view or one of another database", () => {
  rememberView("db-1:v-a", "v-gone");
  assert.equal(rememberedView(views, "db-1:v-a", "db-1"), null);
  rememberView("db-1:v-a", "v-x");
  assert.equal(rememberedView(views, "db-1:v-a", "db-1"), null);
});

test("corrupt storage reads as empty", () => {
  store.set("nds:lastView:v1", "{not json");
  assert.equal(rememberedView(views, "db-1:v-a", "db-1"), null);
  rememberView("db-1:v-a", "v-a");
  assert.equal(rememberedView(views, "db-1:v-a", "db-1"), "v-a");
});
