/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-view.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The live InboundView over the page-file facade's tables: what the planner
// sees of the page tree, the ledger, the echo set and the pending state.

import assert from "node:assert/strict";
import test from "node:test";

import { recordEditorHash } from "../../src/features/ide/model/ideFsEcho.ts";
import { recordSyncedHash } from "../../src/features/ide/model/ideSyncEngine.ts";
import { blockPage, codePage, folderPage, viewWorld } from "./fixtures/inboundWorld.ts";

const tree = () => [
  blockPage("R", "Roadmap"), blockPage("c1", "Child", "R"), folderPage("F", "src"), blockPage("a", "A", "F"),
  codePage("m", "main.ts", "int x;", "F"), codePage("h", "helper.ts", "y", "m"),
];

test("entryAt: every role with its entry id and real path; the folder meta lives in its folder", () => {
  const { view } = viewWorld(tree());
  assert.deepEqual(view.entryAt(["Roadmap.omd"]), { entryId: "R", pageId: "R", role: "page-file", path: "Roadmap.omd" });
  assert.deepEqual(view.entryAt(["Roadmap"]), { entryId: "R#dir", pageId: "R", role: "children-dir", path: "Roadmap" });
  assert.deepEqual(view.entryAt(["Roadmap", "Child.omd"]), { entryId: "c1", pageId: "c1", role: "page-file", path: "Roadmap/Child.omd" });
  assert.deepEqual(view.entryAt(["src"]), { entryId: "F", pageId: "F", role: "folder-dir", path: "src" });
  assert.deepEqual(view.entryAt(["src", "_folder.omd"]), { entryId: "F#meta", pageId: "F", role: "folder-meta", path: "src/_folder.omd" });
  assert.deepEqual(view.entryAt(["src", "main.ts"]), { entryId: "m", pageId: "m", role: "code-file", path: "src/main.ts" });
  assert.deepEqual(view.entryAt(["src", "main.ts.d"]), { entryId: "m#dir", pageId: "m", role: "children-dir", path: "src/main.ts.d" });
  assert.equal(view.entryAt(["Roadmap.omd", "x"]), undefined, "a file is not a directory");
  assert.equal(view.entryAt(["nope.omd"]), undefined);
});

test("entryAt: a case-insensitive-only match is { caseOf } with the REAL path, at any depth", () => {
  const { view } = viewWorld(tree());
  assert.deepEqual(view.entryAt(["roadmap.omd"]), { caseOf: { entryId: "R", pageId: "R", role: "page-file", path: "Roadmap.omd" } });
  assert.deepEqual(view.entryAt(["SRC", "A.omd"]), { caseOf: { entryId: "a", pageId: "a", role: "page-file", path: "src/A.omd" } });
});

test("pageState: path, filePath (a folder's is its _folder.omd), parent; archived; unknown", async () => {
  const pages = [...tree(), { ...blockPage("old", "Old"), archivedAt: "2026-10-13T00:00:00Z" }];
  const { view } = viewWorld(pages);
  assert.deepEqual(view.pageState("c1"), { status: "live", path: "Roadmap/Child.omd", filePath: "Roadmap/Child.omd", isFolder: false, parentId: "R" });
  assert.deepEqual(view.pageState("F"), { status: "live", path: "src", filePath: "src/_folder.omd", isFolder: true, parentId: undefined });
  assert.deepEqual(view.pageState("old"), { status: "archived" });
  assert.equal(view.pageState("elsewhere"), undefined);
});

test("childrenOf: live pages directly inside a children dir or a folder dir (never the meta, never a #dir twin)", () => {
  const { view } = viewWorld(tree());
  assert.deepEqual(view.childrenOf("R#dir"), [{ pageId: "c1", path: "Roadmap/Child.omd" }]);
  assert.deepEqual(new Set(view.childrenOf("F").map((child) => child.pageId)), new Set(["a", "m"]));
  assert.deepEqual(view.childrenOf("m#dir"), [{ pageId: "h", path: "src/main.ts.d/helper.ts" }]);
});

test("moveEvidence: own pending first, else the deepest pending deleted dir over the FILE path", () => {
  const { view, pending } = viewWorld(tree());
  pending.addDeletedDir({ path: "src", role: "folder-dir", ownerId: "F" });
  assert.deepEqual(view.moveEvidence("a"), { kind: "dir", dir: "src", role: "folder-dir", ownerId: "F" });
  assert.deepEqual(view.moveEvidence("F"), { kind: "dir", dir: "src", role: "folder-dir", ownerId: "F" }, "src/_folder.omd is inside src");
  pending.schedule("a", "src/A.omd", async () => {});
  assert.deepEqual(view.moveEvidence("a"), { kind: "own" });
  assert.equal(view.moveEvidence("R"), undefined);
  assert.equal(view.hasOwnPending("a"), true);
});

test("canDelete follows the edit right; ledger and echo are this workspace's; localText is the facade's text", async () => {
  const { view, store, workspaceId, facade } = viewWorld(tree());
  store.canEdit = (entry) => entry._id !== "R";
  assert.equal(view.canDelete("R"), false);
  assert.equal(view.canDelete("c1"), true);
  assert.equal(view.canDelete("elsewhere"), false);
  recordSyncedHash(workspaceId, "Roadmap.omd", "h1");
  assert.equal(view.syncedHashOf("Roadmap.omd"), "h1");
  assert.equal(viewWorld(tree()).view.syncedHashOf("Roadmap.omd"), null, "another workspace's ledger");
  recordEditorHash("echo-view-1");
  assert.equal(view.isEchoHash("echo-view-1"), true);
  assert.equal(await view.localText("R"), await facade.readContent("R"));
  assert.equal(await view.localText("F"), await facade.readContent("F"), "a folder's text is its _folder.omd");
});

test("archivedByInbound reads the pending restore memory", () => {
  const { view, pending } = viewWorld(tree());
  pending.rememberArchived("old", { syncedHash: "h", path: "Old.omd" });
  assert.deepEqual(view.archivedByInbound("old"), { syncedHash: "h", path: "Old.omd" });
  assert.equal(view.archivedByInbound("R"), undefined);
});
