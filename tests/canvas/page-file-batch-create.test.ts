/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-batch-create.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Many creates for one index build: the batch claims names against the tables as
// they stood, adds every page, then checks displacement once per directory.

import assert from "node:assert/strict";
import test from "node:test";

import { createPagesBatch } from "../../src/features/page-file/model/pageFileBatchCreate.ts";
import { createReadableViews } from "../../src/features/page-file/model/pageFileFacadeViews.ts";
import { createFixtureStore, page } from "./page-file-facade-fixtures.ts";

import type { BatchCreateResult } from "../../src/features/page-file/model/pageFileBatchCreate.ts";

const outcome = (result: BatchCreateResult): string => ("page" in result ? `ok ${result.page.title}` : `refused ${result.error}`);

test("batch: three creates read the tables once, before any add, and land where three lone creates would", async () => {
  const store = createFixtureStore("ws-batch-1");
  const inbox = await store.addPage({ title: "inbox", parentId: null, surface: "folder" });
  const views = createReadableViews(store);
  const before = views.tablesFor();
  const read: unknown[] = [];
  const counted = { ...views, tablesFor: () => { const tables = views.tablesFor(); read.push(tables); return tables; } };
  const results = await createPagesBatch(store, counted, [
    { title: "A.omd", parentId: inbox._id, kind: "file", content: '---\nicon: "R"\n---\nalpha\n' },
    { title: "b.ts", parentId: `${inbox._id}`, kind: "file", content: "let b = 1;\n" },
    { title: "Sub", parentId: null, kind: "dir" },
  ]);
  assert.deepEqual(results.map(outcome), ["ok A", "ok b.ts", "ok Sub"]);
  assert.deepEqual(read, [before], "one read, of the tables as they stood before the first add");
  const index = views.indexOf();
  const idOf = (title: string): string => store.pages().find((entry) => entry.title === title)?._id ?? "";
  assert.deepEqual(["A", "b.ts", "Sub"].map((title) => index.pathForId(idOf(title))), ["inbox/A.omd", "inbox/b.ts", "Sub"]);
  assert.equal(store.pages().find((entry) => entry.title === "A")?.icon, "R", "the hand-written front matter is kept (14)");
});

test("batch: a name the tables or an earlier item already claims is refused for that item alone", async () => {
  const store = createFixtureStore("ws-batch-2");
  store._seed([page("taken", "Notes", null, "page", [])]);
  const results = await createPagesBatch(store, createReadableViews(store), [
    { title: "notes.omd", parentId: null, kind: "file", content: "x\n" },
    { title: "Todo.omd", parentId: null, kind: "file", content: "y\n" },
    { title: "TODO.omd", parentId: null, kind: "file", content: "z\n" },
    { title: "_folder.omd", parentId: null, kind: "file", content: "" },
  ]);
  assert.deepEqual(results.map(outcome), [
    "refused AlreadyExists: notes.omd already exists here (names compare case-insensitively)",
    "ok Todo",
    "refused AlreadyExists: TODO.omd already exists here (names compare case-insensitively)",
    "refused Unsupported: a folder's meta file is created with its folder",
  ]);
  assert.deepEqual(store.pages().map((entry) => entry.title), ["Notes", "Todo"]);
});

test("batch: a sibling another writer added mid-batch displaces nobody — the batch page it collides with is archived and refused", async () => {
  const store = createFixtureStore("ws-batch-3");
  const add = store.addPage;
  let raced = false;
  store.addPage = async (input) => {
    if (!raced) {
      raced = true;
      store._seed([...store.pages(), page("a-first", "Zed", null, "page", [])]);
    }
    return add(input);
  };
  const results = await createPagesBatch(store, createReadableViews(store), [
    { title: "Alpha.omd", parentId: null, kind: "file", content: "a\n" },
    { title: "zed.omd", parentId: null, kind: "file", content: "z\n" },
  ]);
  assert.deepEqual(results.map(outcome), ["ok Alpha", "refused AlreadyExists: zed.omd was created concurrently by another writer"]);
  const live = store.pages().filter((entry) => !entry.archivedAt).map((entry) => entry.title).sort();
  assert.deepEqual(live, ["Alpha", "Zed"]);
});
