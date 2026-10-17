/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-sectioned.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { createWorkspaceFileOpsWith, type WorkspaceFileOps } from "../../src/features/ide/model/workspaceFileOps.ts";
import { createMountTable } from "../../src/features/ide/vfs/mountTable.ts";
import { createPageProvider } from "../../src/features/ide/vfs/pageProvider.ts";
import { createPageFileFacade } from "../../src/features/page-file/model/pageFileFacade.ts";
import { buildPageIndex } from "../../src/features/page-file/model/pageIndex.ts";
import { createSectionDeps } from "../../src/features/page-file/model/sectionDeps.ts";
import { createSectionedFacade } from "../../src/features/page-file/model/sectionedFacade.ts";
import { createFixtureStore, rejectsWithCode, type FixtureStore } from "./page-file-facade-fixtures.ts";

interface Rig {
  store: FixtureStore;
  ops: WorkspaceFileOps;
}

const uriOf = (workspaceId: string, rel: string): string => `workspace://${workspaceId}/${rel.split("/").filter(Boolean).join("/")}`;

function rig(options: { owner?: boolean } = {}): Rig {
  const store = createFixtureStore("ws");
  const deps = createSectionDeps({
    pages: () => store.pages(),
    currentUserId: () => "me",
    mayChangeSharing: () => options.owner ?? true,
    patchPage: store.patchPage,
    subscribe: store.subscribe,
  });
  const provider = createPageProvider("workspace", createSectionedFacade(createPageFileFacade(store), deps));
  const mounts = createMountTable();
  mounts.mount("workspace", "ws", provider);
  return { store, ops: createWorkspaceFileOpsWith(mounts, "ws", uriOf) };
}

async function seed(store: FixtureStore, title: string, parentId: string | null, visibility?: "private" | "shared" | "public", ownerId = "me") {
  const created = await store.addPage({ title, parentId, surface: "page" });
  store.patchPage(created._id, { ownerId, ...(visibility ? { visibility } : {}) });
  return created._id;
}

const names = async (ops: WorkspaceFileOps, dir: string): Promise<string[]> => (await ops.list(dir)).map((e) => e.name).sort();
const visibilityOf = (store: FixtureStore, id: string) => store.pages().find((p) => p._id === id)?.visibility;

test("the root always lists the two sections, even with no pages", async () => {
  const { ops } = rig();
  assert.deepEqual((await ops.list("")).map((e) => [e.name, e.kind]).sort(), [["Private", "dir"], ["Shared", "dir"]]);
  assert.deepEqual(await names(ops, "Private"), []);
  assert.deepEqual(await names(ops, "Shared"), []);
});

test("root pages list under their section, subtrees follow the root", async () => {
  const { store, ops } = rig();
  const mine = await seed(store, "Mine", null, "private");
  const ours = await seed(store, "Ours", null, "shared");
  await seed(store, "Sub", mine, "shared");
  await seed(store, "Deep", ours, "private");
  assert.deepEqual(await names(ops, "Private"), ["Mine", "Mine.omd"]);
  assert.deepEqual(await names(ops, "Shared"), ["Ours", "Ours.omd"]);
  assert.deepEqual(await names(ops, "Private/Mine"), ["Sub.omd"]);
  assert.deepEqual(await names(ops, "Shared/Ours"), ["Deep.omd"]);
});

test("archived pages are in no section", async () => {
  const { store, ops } = rig();
  const id = await seed(store, "Gone", null, "private");
  await store.archivePage(id);
  assert.deepEqual(await names(ops, "Private"), []);
});

test("a page called Private does not collide with the Private section", async () => {
  const { store, ops } = rig();
  await seed(store, "Private", null, "private");
  assert.deepEqual((await ops.list("")).map((e) => e.name).sort(), ["Private", "Shared"]);
  assert.deepEqual(await names(ops, "Private"), ["Private.omd"]);
  assert.equal(typeof (await ops.readFile("Private/Private.omd")), "string");
});

test("the real paths sync uses are unchanged by the display layer", async () => {
  const { store, ops } = rig();
  const id = await seed(store, "Plan", null, "private");
  const before = buildPageIndex(store.pages()).pathForId(id);
  await ops.move("Private/Plan.omd", "Shared");
  assert.equal(buildPageIndex(store.pages()).pathForId(id), before);
  assert.equal(before, "Plan.omd");
});

test("a new file in Private is a private page, in Shared a shared page", async () => {
  const { store, ops } = rig();
  await ops.createFile("Private/Alpha.omd");
  await ops.createFile("Shared/Beta.omd");
  const alpha = store.pages().find((p) => p.title === "Alpha");
  const beta = store.pages().find((p) => p.title === "Beta");
  assert.equal(alpha?.parentPageId, null);
  assert.equal(beta?.parentPageId, null);
  assert.equal(visibilityOf(store, alpha?._id ?? ""), "private");
  assert.equal(visibilityOf(store, beta?._id ?? ""), "shared");
  assert.deepEqual(await names(ops, "Private"), ["Alpha.omd"]);
  assert.deepEqual(await names(ops, "Shared"), ["Beta.omd"]);
});

test("a new folder and a nested file keep the section of their root", async () => {
  const { store, ops } = rig();
  await ops.createDir("Shared/Docs");
  await ops.createFile("Shared/Docs/Note.omd");
  const note = store.pages().find((p) => p.title === "Note");
  assert.ok(note?.parentPageId);
  assert.deepEqual(await names(ops, "Shared/Docs"), ["Note.omd"]);
});

test("a create at the virtual root lands in Private", async () => {
  const { ops } = rig();
  await ops.createFile("Loose.omd");
  assert.deepEqual(await names(ops, "Private"), ["Loose.omd"]);
});

test("rename inside a section keeps the section", async () => {
  const { store, ops } = rig();
  await seed(store, "Old", null, "shared");
  await ops.rename("Shared/Old.omd", "New.omd");
  assert.deepEqual(await names(ops, "Shared"), ["New.omd"]);
});

test("moving a root page onto the other section changes its visibility, not its place in the tree", async () => {
  const { store, ops } = rig();
  const id = await seed(store, "Draft", null, "private");
  await ops.move("Private/Draft.omd", "Shared");
  assert.equal(visibilityOf(store, id), "shared");
  assert.equal(store.pages().find((p) => p._id === id)?.parentPageId, null);
  assert.deepEqual(await names(ops, "Private"), []);
  assert.deepEqual(await names(ops, "Shared"), ["Draft.omd"]);
  await ops.move("Shared/Draft.omd", "Private");
  assert.equal(visibilityOf(store, id), "private");
});

test("moving a nested page onto a section promotes it to that section's root", async () => {
  const { store, ops } = rig();
  const parent = await seed(store, "Parent", null, "private");
  const child = await seed(store, "Kid", parent);
  await ops.move("Private/Parent/Kid.omd", "Shared");
  assert.equal(store.pages().find((p) => p._id === child)?.parentPageId, null);
  assert.equal(visibilityOf(store, child), "shared");
});

test("a page cannot be dropped on the virtual root, nor can a section be renamed, moved or removed", async () => {
  const { store, ops } = rig();
  await seed(store, "Keep", null, "private");
  await rejectsWithCode(ops.move("Private/Keep.omd", ""), "Unsupported");
  await rejectsWithCode(ops.rename("Private", "Mine"), "Unsupported");
  await rejectsWithCode(ops.remove("Shared"), "Unsupported");
  await rejectsWithCode(ops.move("Private", "Shared"), "Unsupported");
});

test("only the owner may change a page's section; a published page is not unpublished by a drag", async () => {
  const guest = rig({ owner: false });
  await seed(guest.store, "Theirs", null, "private");
  await rejectsWithCode(guest.ops.move("Private/Theirs.omd", "Shared"), "PermissionDenied");
  assert.deepEqual(await names(guest.ops, "Private"), ["Theirs.omd"]);

  const owner = rig();
  await seed(owner.store, "Site", null, "public");
  await rejectsWithCode(owner.ops.move("Private/Site.omd", "Shared"), "Unsupported");
});

test("in a joined workspace I still have a Private section: my private pages stay there, teammates' pages are Shared", async () => {
  const { store, ops } = rig();
  await seed(store, "Mine", null, "private");
  await seed(store, "Theirs", null, "shared", "you");
  await seed(store, "TheirDraft", null, "private", "you");
  assert.deepEqual(await names(ops, "Private"), ["Mine.omd"]);
  assert.deepEqual(await names(ops, "Shared"), ["TheirDraft.omd", "Theirs.omd"]);
});

test("a create under Private is explicitly private and owned by the creator, whatever the workspace default", async () => {
  const { store, ops } = rig();
  await ops.createFile("Private/Secret.omd");
  await ops.createDir("Private/Notes");
  await ops.createFile("Shared/Open.omd");
  const visibilities = store.pages().map((p) => [p.title, p.visibility]);
  assert.deepEqual(visibilities.sort(), [["Notes", "private"], ["Open", "shared"], ["Secret", "private"]]);
});

test("a teammate's page cannot be pulled into Private by a non-owner", async () => {
  const { store, ops } = rig({ owner: false });
  await seed(store, "Theirs", null, "shared", "you");
  await rejectsWithCode(ops.move("Shared/Theirs.omd", "Private"), "PermissionDenied");
  assert.deepEqual(await names(ops, "Shared"), ["Theirs.omd"]);
});

test("remove archives through the section path", async () => {
  const { store, ops } = rig();
  const id = await seed(store, "Bye", null, "shared");
  await ops.remove("Shared/Bye.omd");
  assert.ok(store.pages().find((p) => p._id === id)?.archivedAt);
});

test("write and read go through the section path to the same page", async () => {
  const { store, ops } = rig();
  await seed(store, "Doc", null, "shared");
  const text = await ops.readFile("Shared/Doc.omd");
  await ops.writeFile("Shared/Doc.omd", text);
  assert.equal(store.pages().filter((p) => p.title === "Doc").length, 1);
});

test("watch fires when a visibility change moves a page between sections, and stays quiet for a body edit", async () => {
  const { store, ops } = rig();
  const id = await seed(store, "Mover", null, "private");
  const controller = new AbortController();
  let fired = 0;
  const watching = ops.watch("", () => { fired += 1; }, controller.signal);
  store.updatePageContent(id, []);
  assert.equal(fired, 0);
  store.patchPage(id, { visibility: "shared" });
  controller.abort();
  await watching;
  assert.ok(fired >= 1);
});
