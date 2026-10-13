/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-facade-collisions.test.ts                :+:      :+:    :+:   */
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
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { createFixtureStore, page, rejectsWithCode, type FixtureStore } from "./page-file-facade-fixtures.ts";

type Facade = ReturnType<typeof createPageFileFacade>;

/** The two store fields a rename or a move writes: nothing else may move either. */
function shape(store: FixtureStore): string[] {
  return store.pages().map((p) => `${p._id}|${p.title}|${p.parentPageId ?? ""}|${p.archivedAt ?? ""}`);
}

/** Seed `pages`, refuse `act`, and prove the store still holds what it held. */
async function refusesWithoutChange(pages: readonly PageEntry[], act: (facade: Facade) => Promise<void>, code: "AlreadyExists" | "Unsupported"): Promise<void> {
  const store = createFixtureStore("ws");
  store._seed([...pages]);
  const facade = createPageFileFacade(store);
  const before = shape(store);

  await rejectsWithCode(act(facade), code);
  assert.deepEqual(shape(store), before, "the store is byte-for-byte what it was");
}

// The index names siblings in ID order, so both the page-onto-folder and the
// folder-onto-page collision have to be caught whichever id sorts first.
for (const [folderId, pageId] of [["f9", "n1"], ["a1", "z9"]]) {
  test(`rename: Notes.omd -> Roadmap.omd is refused beside folder Roadmap/ (ids ${folderId}/${pageId})`, async () => {
    await refusesWithoutChange(
      [page(folderId, "Roadmap", null, "folder"), page(pageId, "Notes.omd", null)],
      (facade) => facade.rename(pageId, "Roadmap.omd"),
      "AlreadyExists",
    );
  });

  test(`rename: folder Roadmap/ -> Notes is refused beside page Notes.omd (ids ${folderId}/${pageId})`, async () => {
    await refusesWithoutChange(
      [page(folderId, "Roadmap", null, "folder"), page(pageId, "Notes.omd", null)],
      (facade) => facade.rename(folderId, "Notes"),
      "AlreadyExists",
    );
  });
}

test("move: a page into a folder whose child already reserves the name is refused", async () => {
  await refusesWithoutChange(
    [page("d1", "Docs", null, "folder"), page("c1", "Draft.omd", "d1"), page("m1", "Draft.omd", null)],
    (facade) => facade.move("m1", "d1"),
    "AlreadyExists",
  );
});

test("rename: a case-only change of the page's own name still succeeds", async () => {
  const store = createFixtureStore("ws");
  store._seed([page("n1", "notes.omd", null)]);
  const facade = createPageFileFacade(store);

  await facade.rename("n1", "Notes.omd");

  assert.equal(store.pages()[0].title, "Notes");
  assert.equal(facade.list().map((e) => e.name).join(), "Notes.omd");
});

// `_folder.omd` is seeded into `claimed` for EVERY directory, so a page by that
// name can only be renamed away by the index. Nothing here looks at `claimedIn`,
// so an empty folder and an empty workspace refuse exactly the same.
test("create: mkdir _folder.omd is refused even with an empty workspace", async () => {
  await refusesWithoutChange([], (facade) => facade.create({ title: "_folder.omd", parentId: null, kind: "dir", content: "" }), "Unsupported");
});

test("create: write _FOLDER.OMD is refused even with an empty workspace", async () => {
  await refusesWithoutChange([], (facade) => facade.create({ title: "_FOLDER.OMD", parentId: null, kind: "file", content: "" }), "Unsupported");
});

test("create: _folder.omd is refused inside an existing folder too", async () => {
  await refusesWithoutChange(
    [page("d1", "Docs", null, "folder"), page("c1", "Readme.omd", "d1")],
    (facade) => facade.create({ title: "_folder.omd", parentId: "d1", kind: "file", content: "" }),
    "Unsupported",
  );
});

test("rename: to _Folder.omd is refused whatever the case of the incoming name", async () => {
  await refusesWithoutChange([page("n1", "Notes.omd", null)], (facade) => facade.rename("n1", "_Folder.omd"), "Unsupported");
});
