/* ************************************************************************** */
/*                                                                            */
/*                                            :::      ::::::::   */
/*   page-file-facade-readwrite.test.ts                       :+:      :+:    :+:   */
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

test("page-file-facade: readContent returns pageFileText for block page", async () => {
  const store = createFixtureStore("ws");
  const page = await store.addPage({
    title: "Test.omd",
    parentId: null,
    surface: "page",
    content: [{ id: "b1", type: "paragraph", content: "Hello world" }],
  });
  const facade = createPageFileFacade(store);

  const content = await facade.readContent(page._id);
  assert.ok(content.includes("Hello world"));
  assert.ok(content.endsWith(".omd") || content.includes("---")); // front-matter present
});

test("page-file-facade: readContent for folder meta returns front-matter only", async () => {
  const store = createFixtureStore("ws");
  const folder = await store.addPage({ title: "src", parentId: null, surface: "folder", content: [] });
  const facade = createPageFileFacade(store);

  // Folder meta file has synthetic id
  const metaId = `${folder._id}#meta`;
  const content = await facade.readContent(metaId);
  assert.ok(content.startsWith("---")); // front-matter only
  assert.ok(content.includes('surface: "folder"')); // JSON-stringified in front-matter
});

test("page-file-facade: writeContent on code page updates code block", async () => {
  const store = createFixtureStore("ws");
  const page = await store.addPage({
    title: "main.ts",
    parentId: null,
    surface: "code",
    content: [{ id: "b1", type: "code", content: "old", language: "typescript", fileName: "main.ts", lineNumbers: true, codeTheme: "dark" }],
  });
  const facade = createPageFileFacade(store);

  await facade.writeContent(page._id, "new content");

  const pages = store.pages();
  const updated = pages.find((p) => p._id === page._id);
  assert.ok(updated);
  const codeBlock = updated.content?.find((b) => b.type === "code");
  assert.ok(codeBlock);
  assert.equal(codeBlock.content, "new content");
});

test("page-file-facade: writeContent on archived page throws", async () => {
  const store = createFixtureStore("ws");
  const page = await store.addPage({ title: "Test.omd", parentId: null, surface: "page" });
  await store.archivePage(page._id);
  const facade = createPageFileFacade(store);

  await assert.rejects(
    facade.writeContent(page._id, "new"),
    (e) => e instanceof Error && e.message.includes("not a live writable page"),
  );
});

test("page-file-facade: synthetic #dir and #meta ids map back to page id", async () => {
  const store = createFixtureStore("ws");
  const page = await store.addPage({ title: "Test.omd", parentId: null, surface: "page" });
  const facade = createPageFileFacade(store);

  const list = facade.list();
  const fileEntry = list.find((e) => e.id === page._id && e.kind === "file");
  const dirEntry = list.find((e) => e.id === `${page._id}#dir` && e.kind === "dir");
  const metaEntry = list.find((e) => e.id === `${page._id}#meta` && e.kind === "file");

  // For a block page with no children, there should be no #dir entry
  assert.ok(fileEntry);
  assert.equal(dirEntry, undefined, "No #dir for leaf block page");
  assert.equal(metaEntry, undefined, "No #meta for non-folder page");

  // Now add a child
  await store.addPage({ title: "Child.omd", parentId: page._id, surface: "page" });
  // Need new facade to see updated tables (subscribe would fire, but we create new)
  const facade2 = createPageFileFacade(store);
  const list2 = facade2.list();
  const dirEntry2 = list2.find((e) => e.id === `${page._id}#dir` && e.kind === "dir");
  assert.ok(dirEntry2, "#dir appears when page has children");
});