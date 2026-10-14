/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-facade-guards.test.ts                    :+:      :+:    :+:   */
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
import { createFixtureStore, page, rejectsWithCode, unloadedPage } from "./page-file-facade-fixtures.ts";

const codeBlock = (id: string, fileName: string) =>
  ({ id, type: "code", content: "old", language: "typescript", fileName, lineNumbers: true, codeTheme: "dark" }) as const;

test("read: a hydrated-but-never-opened page loads its body first", async () => {
  const store = createFixtureStore("ws");
  store._seed([unloadedPage("u1", "Doc.omd", null)]);
  store._server.set("u1", [{ id: "b1", type: "paragraph", content: "server body" }]);

  assert.ok((await createPageFileFacade(store).readContent("u1")).includes("server body"));
});

test("write: a page whose body fails to load is refused and the store is untouched", async () => {
  const store = createFixtureStore("ws");
  store._seed([unloadedPage("u1", "Doc.omd", null)]);
  const before = store.pages();

  // The read of the same page is fine (front matter only); the write is not, because
  // patching a body the store never received would drop blocks that are merely UNLOADED.
  assert.ok((await createPageFileFacade(store).readContent("u1")).startsWith("---\n"));
  await rejectsWithCode(createPageFileFacade(store).writeContent("u1", "# overwrite"), "Io");
  assert.equal(store.pages(), before);
});

test("write: a code page without a code block throws instead of succeeding as a no-op", async () => {
  const store = createFixtureStore("ws");
  store._seed([page("c1", "main.ts", null, "code", [])]);

  await rejectsWithCode(createPageFileFacade(store).writeContent("c1", "x"), "Io");
});

test("write: a read-only page is refused with PermissionDenied and left untouched", async () => {
  const store = createFixtureStore("ws");
  store._seed([page("p1", "Doc.omd", null, "page", [{ id: "b1", type: "paragraph", content: "keep" }])]);
  store.canEdit = () => false;
  const before = store.pages();

  await rejectsWithCode(createPageFileFacade(store).writeContent("p1", "# nope"), "PermissionDenied");
  assert.equal(store.pages(), before);
});

test("move: into the page's own subtree (mv Roadmap.omd Roadmap/) is refused", async () => {
  const store = createFixtureStore("ws");
  const roadmap = await store.addPage({ title: "Roadmap.omd", parentId: null, surface: "page" });
  await store.addPage({ title: "Q3.omd", parentId: roadmap._id, surface: "page" });
  const before = store.pages();

  await rejectsWithCode(createPageFileFacade(store).move(roadmap._id, `${roadmap._id}#dir`), "Loop");
  assert.equal(store.pages(), before);
});

test("a folder's #meta file cannot be removed, renamed or moved: that would act on the whole folder", async () => {
  const store = createFixtureStore("ws");
  const src = await store.addPage({ title: "src", parentId: null, surface: "folder" });
  const other = await store.addPage({ title: "other", parentId: null, surface: "folder" });
  const facade = createPageFileFacade(store);
  const meta = `${src._id}#meta`;
  const before = store.pages();

  await rejectsWithCode(facade.archive(meta), "Unsupported");
  await rejectsWithCode(facade.rename(meta, "x.omd"), "Unsupported");
  await rejectsWithCode(facade.move(meta, other._id), "Unsupported");
  assert.equal(store.pages(), before);
});

test("rename: a code page's .d directory keeps the page title free of the suffix", async () => {
  const store = createFixtureStore("ws");
  const main = await store.addPage({ title: "main.ts", parentId: null, surface: "code", content: [codeBlock("b1", "main.ts")] });
  await store.addPage({ title: "h.ts", parentId: main._id, surface: "code", content: [codeBlock("b2", "h.ts")] });
  const facade = createPageFileFacade(store);

  await rejectsWithCode(facade.rename(`${main._id}#dir`, "util.ts"), "Unsupported");
  await facade.rename(`${main._id}#dir`, "util.ts.d");

  assert.equal(store.pages().find((p) => p._id === main._id)?.title, "util.ts");
});

test("archive: resolves only after the store archived, and surfaces its rejection", async () => {
  const store = createFixtureStore("ws");
  const doc = await store.addPage({ title: "Doc.omd", parentId: null, surface: "page" });
  const facade = createPageFileFacade(store);
  let archived = false;
  store.archivePage = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    archived = true;
  };

  await facade.archive(doc._id);
  assert.equal(archived, true, "rm must not resolve before the archive");

  store.archivePage = async () => { throw new Error("server said no"); };
  await assert.rejects(facade.archive(doc._id), /server said no/);
});

test("access: revoking a page's access under the SAME pages array hides it", async () => {
  const store = createFixtureStore("ws");
  store._seed([page("p1", "Keep.omd", null), page("p2", "Revoked.omd", null)]);
  const revoked = new Set<string>();
  store.canRead = (entry) => !revoked.has(entry._id);
  const facade = createPageFileFacade(store);
  const pages = store.pages();
  assert.equal(facade.list().length, 2);

  revoked.add("p2");
  store.replaceAccess();

  assert.equal(store.pages(), pages, "the user store kept the very same array");
  assert.deepEqual(facade.list().map((e) => e.id), ["p1"]);
});

test("rename, move and archive of a read-only page are refused, not reported as success", async () => {
  const store = createFixtureStore("ws");
  store._seed([page("p1", "a.txt", null, "code", [codeBlock("b", "a.txt")]), page("p2", "dir", null, "folder")]);
  const facade = createPageFileFacade({ ...store, canEdit: () => false });
  const before = store.pages();

  await rejectsWithCode(facade.rename("p1", "b.txt"), "PermissionDenied");
  await rejectsWithCode(facade.move("p1", "p2"), "PermissionDenied");
  await rejectsWithCode(facade.archive("p1"), "PermissionDenied");

  assert.equal(store.pages(), before, "the store was never touched");
});

test("move: the cycle check walks the target's ancestors, not the whole page set", async () => {
  const store = createFixtureStore("ws");
  const reads = { parent: 0 };
  const counted = (entry: PageEntry): PageEntry => {
    const parent = entry.parentPageId;
    return Object.defineProperty({ ...entry }, "parentPageId", { get: () => { reads.parent++; return parent; }, enumerable: true });
  };
  const flat = Array.from({ length: 2000 }, (_, i) => counted(page(`n${i}`, `t${i}`, i === 0 ? null : `n${i - 1}`, "folder")));
  store._seed(flat);
  const facade = createPageFileFacade(store);
  facade.list(); // builds the cached slice and index; the move itself must add almost no reads
  reads.parent = 0;

  await rejectsWithCode(facade.move("n3", "n5"), "Loop");
  assert.ok(reads.parent < 50, `walked ${reads.parent} parent links for a depth-5 chain in 2000 pages`);
});

// A server page document may legitimately carry no `content` field at all, so a
// read of such a page answers with whatever the store holds: front matter only.
test("read: a body still missing after the fetch reads as front matter only", async () => {
  const store = createFixtureStore("ws");
  store._seed([unloadedPage("u1", "Doc.omd", null)]);

  const text = await createPageFileFacade(store).readContent("u1");

  assert.ok(text.startsWith("---\n"), `not front matter: ${JSON.stringify(text)}`);
  assert.ok(text.includes('title: "Doc.omd"'), `title missing: ${JSON.stringify(text)}`);
  assert.equal(text.split("\n").filter((line) => line === "---").length, 2, "a body would add a third fence");
});

test("rename, move and archive of a page the user cannot read are NotFound", async () => {
  const store = createFixtureStore("ws");
  store._seed([page("p1", "secret.txt", null, "code", [codeBlock("b", "secret.txt")])]);
  const facade = createPageFileFacade({ ...store, canRead: () => false });

  await rejectsWithCode(facade.rename("p1", "b.txt"), "NotFound");
  await rejectsWithCode(facade.move("p1", null), "NotFound");
  await rejectsWithCode(facade.archive("p1"), "NotFound");
});
