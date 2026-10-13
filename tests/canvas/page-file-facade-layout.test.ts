/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::   */
/*   page-file-facade-layout.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur         #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";
import { createPageFileFacade } from "../../src/features/page-file/model/pageFileFacade.ts";
import { createFixtureStore } from "./page-file-facade-fixtures.ts";

test("page-file-facade: dual FILE+DIR layout for block page with children", async () => {
  const store = createFixtureStore("ws");
  // Create a block page "Roadmap" with a child "Q3"
  const roadmap = await store.addPage({ title: "Roadmap.omd", parentId: null, surface: "page" });
  await store.addPage({ title: "Q3.omd", parentId: roadmap._id, surface: "page" });
  const facade = createPageFileFacade(store);

  const list = facade.list();
  // Should have: Roadmap.omd (file), Roadmap/ (dir), Q3.omd (file) — no _folder.omd for block pages
  const roadmapFile = list.find((e) => e.name === "Roadmap.omd");
  const roadmapDir = list.find((e) => e.name === "Roadmap" && e.kind === "dir");
  const folderMeta = list.find((e) => e.name === "_folder.omd" && e.parentId === roadmapDir?.id);
  const q3File = list.find((e) => e.name === "Q3.omd");

  assert.ok(roadmapFile, "Roadmap.omd file exists");
  assert.equal(roadmapFile.kind, "file");
  assert.ok(roadmapDir, "Roadmap/ dir exists");
  assert.equal(roadmapDir.kind, "dir");
  assert.equal(folderMeta, undefined, "no _folder.omd for block page with children");
  assert.ok(q3File, "Q3.omd exists inside Roadmap/");
  assert.equal(q3File.kind, "file");
  assert.equal(q3File.parentId, roadmapDir?.id);
});

test("page-file-facade: folder page has DIR + _folder.omd (#meta)", async () => {
  const store = createFixtureStore("ws");
  const folder = await store.addPage({ title: "src", parentId: null, surface: "folder" });
  const facade = createPageFileFacade(store);

  const list = facade.list();
  const folderDir = list.find((e) => e.name === "src" && e.kind === "dir");
  // _folder.omd is hidden from list(); use childByName to access it explicitly
  const folderMeta = facade.childByName?.(folderDir?.id ?? "", "_folder.omd");

  assert.ok(folderDir, "src/ dir exists");
  assert.equal(folderDir.kind, "dir");
  assert.equal(folderDir.id, folder._id); // folder's DIR id IS its page id
  assert.ok(folderMeta, "_folder.omd exists (via childByName)");
  assert.equal(folderMeta?.kind, "file");
  assert.equal(folderMeta?.id, `${folder._id}#meta`);
});

test("page-file-facade: code page is a raw FILE, rarely a DIR for children", async () => {
  const store = createFixtureStore("ws");
  const codePage = await store.addPage({ title: "main.ts", parentId: null, surface: "code", content: [{ id: "b1", type: "code", content: "console.log(1)", language: "typescript", fileName: "main.ts", lineNumbers: true, codeTheme: "dark" }] });
  // Add a child to the code page (rare)
  await store.addPage({ title: "helper.ts", parentId: codePage._id, surface: "code", content: [{ id: "b2", type: "code", content: "export const x = 1", language: "typescript", fileName: "helper.ts", lineNumbers: true, codeTheme: "dark" }] });
  const facade = createPageFileFacade(store);

  const list = facade.list();
  const codeFile = list.find((e) => e.name === "main.ts" && e.kind === "file");
  const codeDir = list.find((e) => e.name === "main.ts.d" && e.kind === "dir");
  const childFile = list.find((e) => e.name === "helper.ts" && e.kind === "file" && e.parentId === codeDir?.id);

  assert.ok(codeFile, "main.ts file exists");
  assert.equal(codeFile.kind, "file");
  assert.equal(codeFile.id, codePage._id);
  assert.ok(codeDir, "main.ts.d/ dir exists for children");
  assert.equal(codeDir.id, `${codePage._id}#dir`);
  assert.ok(childFile, "helper.ts exists inside main.ts.d/");
});

test("page-file-facade: create by extension - *.omd creates block page", async () => {
  const store = createFixtureStore("ws");
  const facade = createPageFileFacade(store);

  const created = await facade.create({ title: "NewPage.omd", parentId: null, kind: "file", content: "# Hello" });
  assert.equal(created.name, "NewPage.omd");
  assert.equal(created.kind, "file");

  // Verify the page was created with surface "page" and title "NewPage"
  const pages = store.pages();
  const newPage = pages.find((p) => p.title === "NewPage" && p.surface === "page");
  assert.ok(newPage, "Block page created with title 'NewPage' and surface 'page'");
});

test("page-file-facade: create by extension - other names create code page", async () => {
  const store = createFixtureStore("ws");
  const facade = createPageFileFacade(store);

  const created = await facade.create({ title: "script.py", parentId: null, kind: "file", content: "print('hi')" });
  assert.equal(created.name, "script.py");
  assert.equal(created.kind, "file");

  const pages = store.pages();
  const newPage = pages.find((p) => p.title === "script.py" && p.surface === "code");
  assert.ok(newPage, "Code page created with title 'script.py' and surface 'code'");
});

test("page-file-facade: _folder.omd is not creatable", async () => {
  const store = createFixtureStore("ws");
  const facade = createPageFileFacade(store);

  await assert.rejects(
    facade.create({ title: "_folder.omd", parentId: null, kind: "file", content: "" }),
    (e) => e instanceof Error && e.message.includes("folder's meta file is created with its folder"),
  );
});

test("page-file-facade: mkdir creates folder page", async () => {
  const store = createFixtureStore("ws");
  const facade = createPageFileFacade(store);

  const created = await facade.create({ title: "newdir", parentId: null, kind: "dir" });
  assert.equal(created.name, "newdir");
  assert.equal(created.kind, "dir");

  const pages = store.pages();
  const newPage = pages.find((p) => p.title === "newdir" && p.surface === "folder");
  assert.ok(newPage, "Folder page created with surface 'folder'");
});