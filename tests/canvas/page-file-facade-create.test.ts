/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-facade-create.test.ts                    :+:      :+:    :+:   */
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
import { isFsError } from "../../src/features/ide/vfs/errors.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";
import { createPageProvider } from "../../src/features/ide/vfs/pageProvider.ts";
import { createFixtureStore, page, rejectsWithCode } from "./page-file-facade-fixtures.ts";

const codeBlock = (id: string, fileName: string) =>
  ({ id, type: "code", content: "", language: "typescript", fileName, lineNumbers: true, codeTheme: "dark" }) as const;

test("create: a file, a dir and an .omd inside a block page's synthetic #dir reach the store with the OWNING page id", async () => {
  const store = createFixtureStore("ws");
  const roadmap = await store.addPage({ title: "Roadmap.omd", parentId: null, surface: "page" });
  await store.addPage({ title: "Q3.omd", parentId: roadmap._id, surface: "page" });
  const facade = createPageFileFacade(store);
  const dirId = `${roadmap._id}#dir`;

  await facade.create({ title: "notes.py", parentId: dirId, kind: "file", content: "x" });
  await facade.create({ title: "sub", parentId: dirId, kind: "dir" });
  await facade.create({ title: "Q4.omd", parentId: dirId, kind: "file", content: "" });

  for (const title of ["notes.py", "sub", "Q4"]) {
    assert.equal(store.pages().find((p) => p.title === title)?.parentPageId, roadmap._id, `${title} parent`);
  }
});

test("create: inside a code page's .d/ directory the parent is the code page", async () => {
  const store = createFixtureStore("ws");
  const main = await store.addPage({ title: "main.ts", parentId: null, surface: "code", content: [codeBlock("b1", "main.ts")] });
  await store.addPage({ title: "helper.ts", parentId: main._id, surface: "code", content: [codeBlock("b2", "helper.ts")] });
  const facade = createPageFileFacade(store);

  await facade.create({ title: "more.ts", parentId: `${main._id}#dir`, kind: "file", content: "" });
  await facade.create({ title: "deeper", parentId: `${main._id}#dir`, kind: "dir" });

  assert.equal(store.pages().find((p) => p.title === "more.ts")?.parentPageId, main._id);
  assert.equal(store.pages().find((p) => p.title === "deeper")?.parentPageId, main._id);
});

test("create: a name clashing case-insensitively is refused BEFORE addPage, whatever the id order", async () => {
  const store = createFixtureStore("ws");
  // "p10" sorts before "p2": the check must be by name, never by id order.
  store._seed([page("p10", "Case.txt", null, "code", [codeBlock("b", "Case.txt")]), page("p2", "other.txt", null, "code", [codeBlock("c", "other.txt")])]);
  const facade = createPageFileFacade(store);
  const before = store.pages();

  await rejectsWithCode(facade.create({ title: "case.txt", parentId: null, kind: "file", content: "" }), "AlreadyExists");
  await rejectsWithCode(facade.create({ title: "OTHER.TXT", parentId: null, kind: "file", content: "" }), "AlreadyExists");
  assert.equal(store.pages(), before, "nothing was created, not even a page archived afterwards");
});

test("create: a name that only changes under sanitizing is NOT a collision", async () => {
  const store = createFixtureStore("ws");
  const facade = createPageFileFacade(store);

  const created = await facade.create({ title: "a  b.txt", parentId: null, kind: "file", content: "" });

  assert.equal(created.name, "a b.txt");
});

test("the provider over the page-file facade declares case-insensitive-preserving names, and lookup honours it", async () => {
  const store = createFixtureStore("ws");
  const facade = createPageFileFacade(store);
  await facade.create({ title: "Case.txt", parentId: null, kind: "file", content: "" });

  assert.equal(createPageProvider("workspace", facade).capabilities().caseSensitivity, "insensitive-preserving");
  assert.equal(facade.childByName?.(null, "case.txt")?.name, "Case.txt");
});

test("create: a store that returns no page throws an FsError, not a plain Error", async () => {
  const store = createFixtureStore("ws");
  const facade = createPageFileFacade({ ...store, addPage: async () => null });

  await rejectsWithCode(facade.create({ title: "x.py", parentId: null, kind: "file", content: "" }), "Io");
});

// assignSiblingNames reserves TWO names per page (its own and its child dir), but the
// child dir is only LISTED once the page has children. Refusal happens before addPage,
// so the new page's id can never matter; both existing-id orders are covered anyway.
for (const existingId of ["p0", "p9"]) {
  const refused: [string, PageEntry, { title: string; kind: "file" | "dir" }][] = [
    ["mkdir Roadmap next to a childless Roadmap.omd", page(existingId, "Roadmap", null), { title: "Roadmap", kind: "dir" }],
    ["write Roadmap.omd next to a folder Roadmap/", page(existingId, "Roadmap", null, "folder"), { title: "Roadmap.omd", kind: "file" }],
    ["mkdir main.ts.d next to a childless main.ts", page(existingId, "main.ts", null, "code", [codeBlock("b", "main.ts")]), { title: "main.ts.d", kind: "dir" }],
  ];
  for (const [label, existing, input] of refused) {
    test(`create: ${label} is refused before addPage (existing id ${existingId})`, async () => {
      const store = createFixtureStore("ws");
      store._seed([existing]);
      let adds = 0;
      const facade = createPageFileFacade({ ...store, addPage: async (next) => { adds++; return store.addPage(next); } });

      await rejectsWithCode(facade.create({ ...input, parentId: null, content: "" }), "AlreadyExists");

      assert.equal(adds, 0);
      assert.equal(store.pages().length, 1);
    });
  }
}

// The real addPage adds only after its POST resolves, so both creates pass the pre-check.
// The index names siblings in id order: when the SECOND create's id sorts first it takes the
// plain name and renames the FIRST creator's page, which already returned. Timers make the
// two POSTs land one after the other, as separate network responses do.
for (const [order, firstId, secondId] of [["second sorts first", "p5", "p1"], ["second sorts last", "p1", "p5"]]) {
  test(`create: two creates of one name in flight (${order}) - the first creator's page survives plain, the second is refused`, async () => {
    const store = createFixtureStore("ws");
    const ids = [firstId, secondId];
    let calls = 0;
    const facade = createPageFileFacade({
      ...store,
      addPage: async (next) => {
        await new Promise((resolve) => setTimeout(resolve, 5 * calls++));
        const created = page(ids.shift() ?? "px", next.title, next.parentId, next.surface, next.content);
        store._seed([...store.pages(), created]);
        return created;
      },
    });
    const make = () => facade.create({ title: "Roadmap.omd", parentId: null, kind: "file", content: "" });

    const [first, second] = await Promise.allSettled([make(), make()]);

    assert.equal(first.status, "fulfilled");
    assert.equal(second.status, "rejected");
    assert.equal(isFsError(second.status === "rejected" ? second.reason : null) && (second.reason as { code: string }).code, "AlreadyExists");
    assert.deepEqual(store.pages().filter((p) => !p.archivedAt).map((p) => p._id), [firstId]);
    assert.deepEqual(facade.list().map((e) => e.name), ["Roadmap.omd"], "no ' (2)' name survives");
  });
}
