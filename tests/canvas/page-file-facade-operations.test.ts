/* ************************************************************************** */
/*                                                                            */
/*                                                  :::      ::::::::   */
/*   page-file-facade-operations.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";
import { createPageFileFacade } from "../../src/features/page-file/model/pageFileFacade.ts";
import { createFixtureStore } from "./page-file-facade-fixtures.ts";

test("page-file-facade: rename X.omd -> Y.omd retitles the page", async () => {
  const store = createFixtureStore("ws");
  const page = await store.addPage({ title: "Old.omd", parentId: null, surface: "page" });
  const facade = createPageFileFacade(store);

  await facade.rename(page._id, "New.omd");

  const pages = store.pages();
  const updated = pages.find((p) => p._id === page._id);
  assert.ok(updated);
  assert.equal(updated.title, "New"); // Title should be "New" (without .omd)
});

test("page-file-facade: move updates parent", async () => {
  const store = createFixtureStore("ws");
  const parent = await store.addPage({ title: "parent", parentId: null, surface: "folder" });
  const child = await store.addPage({ title: "child.omd", parentId: null, surface: "page" });
  const facade = createPageFileFacade(store);

  await facade.move(child._id, parent._id);

  const pages = store.pages();
  const moved = pages.find((p) => p._id === child._id);
  assert.ok(moved);
  assert.equal(moved.parentPageId, parent._id);
});

test("page-file-facade: archived pages are invisible", async () => {
  const store = createFixtureStore("ws");
  const live = await store.addPage({ title: "live.omd", parentId: null, surface: "page" });
  const archived = await store.addPage({ title: "archived.omd", parentId: null, surface: "page" });
  // Archive it directly
  await store.archivePage(archived._id);
  const facade = createPageFileFacade(store);

  const list = facade.list();
  const liveEntry = list.find((e) => e.id === live._id);
  const archivedEntry = list.find((e) => e.id === archived._id);

  assert.ok(liveEntry, "Live page is visible");
  assert.equal(archivedEntry, undefined, "Archived page is invisible");
});

test("page-file-facade: unreadable pages are invisible", async () => {
  const store = createFixtureStore("ws");
  store.canRead = (page) => page.title !== "secret.omd";
  const visible = await store.addPage({ title: "visible.omd", parentId: null, surface: "page" });
  await store.addPage({ title: "secret.omd", parentId: null, surface: "page" });
  const facade = createPageFileFacade(store);

  const list = facade.list();
  const visibleEntry = list.find((e) => e.id === visible._id);
  const secretEntry = list.find((e) => e.name === "secret.omd");

  assert.ok(visibleEntry, "Readable page is visible");
  assert.equal(secretEntry, undefined, "Unreadable page is invisible");
});