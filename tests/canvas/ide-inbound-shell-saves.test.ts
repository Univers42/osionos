/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-shell-saves.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shell saves that land before the outbound writer runs (C3b5 R1-R3, R5). The page a
// shell file made or changed has a canonical text (front-matter id, `updated:`) that
// differs from the shell bytes, so "ours moved since the agreement" must not read a
// save that follows as a conflict — and our own stale write must never be applied.

import assert from "node:assert/strict";
import test from "node:test";

import { recordEditorHash, sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { recordOutboundWrite, recordSyncedHash, syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { useIdeSyncConflicts } from "../../src/features/ide/model/ideSyncConflicts.ts";
import { fileIn } from "./fixtures/attachWorld.ts";
import { b64, blockPage, codePage, execWorld, folderPage, para, putFile } from "./fixtures/inboundWorld.ts";
import { snapshotOf, writerRound } from "./fixtures/outboundWorld.ts";

type World = Awaited<ReturnType<typeof execWorld>>;

const conflictPaths = (): string[] => Object.values(useIdeSyncConflicts.getState().byPageId).map((conflict) => conflict.relPath);
const titled = (world: World, title: string) => world.store.pages().filter((entry) => entry.title === title && !entry.archivedAt);
const bodyOf = (world: World, id: string | undefined): unknown => world.store.pages().find((entry) => entry._id === id)?.content?.[0]?.content;
const headOf = (text: string): string => text.slice(0, text.lastIndexOf("---\n") + 4);

/** Roadmap agreed on: the ledger holds the text the app would write for it. */
async function syncedRoadmap() {
  useIdeSyncConflicts.getState().clearWorkspace();
  const world = await execWorld([blockPage("R", "Roadmap")]);
  const ours = await world.session.facade.readContent("R");
  recordSyncedHash(world.workspaceId, "Roadmap.omd", await sha16(ours));
  return { world, head: headOf(ours) };
}

test("R1: one shell write emitted twice with the same bytes (IN_CREATE, IN_MODIFY) — one page, no conflict", async () => {
  useIdeSyncConflicts.getState().clearWorkspace();
  const world = await execWorld([folderPage("I", "inbox")]);
  await world.shellWrite("inbox/N.omd", "x\n");
  await world.shellWrite("inbox/N.omd", "x\n");
  assert.equal(titled(world, "N").length, 1);
  assert.deepEqual(conflictPaths(), []);
  assert.equal(syncedHashOf(world.workspaceId, "inbox/N.omd"), await sha16("x\n"));
});

test("R2: shell create v1, then v2 before the writer runs — v2 applies, no conflict", async () => {
  useIdeSyncConflicts.getState().clearWorkspace();
  const world = await execWorld([folderPage("I", "inbox")]);
  await world.shellWrite("inbox/M.omd", "v1\n");
  await world.shellWrite("inbox/M.omd", "v2\n");
  assert.deepEqual(conflictPaths(), []);
  assert.equal(bodyOf(world, titled(world, "M")[0]?._id), "v2");
  assert.equal(syncedHashOf(world.workspaceId, "inbox/M.omd"), await sha16("v2\n"));
});

test("R3: two shell saves of a synced page before the writer runs — the second applies, no conflict", async () => {
  const { world, head } = await syncedRoadmap();
  await world.shellWrite("Roadmap.omd", `${head}save one\n`);
  await world.shellWrite("Roadmap.omd", `${head}save two\n`);
  assert.deepEqual(conflictPaths(), []);
  assert.equal(bodyOf(world, "R"), "save two");
  assert.equal(syncedHashOf(world.workspaceId, "Roadmap.omd"), await sha16(`${head}save two\n`));
});

test("R5: the writer's stale write lands after a newer shell save — a conflict, the shell save stays", async () => {
  const { world, head } = await syncedRoadmap();
  await world.shellWrite("Roadmap.omd", `${head}v2\n`);
  // The writer read v2 (= the ledger), recorded c(S2), and writes it after the shell's v3.
  const c2 = await world.session.facade.readContent("R");
  recordOutboundWrite(world.workspaceId, "Roadmap.omd", await sha16(c2));
  await world.shellWrite("Roadmap.omd", `${head}v3\n`);
  await world.send({ event: "write", path: "Roadmap.omd", hash: await sha16(c2), content: b64(c2) });
  await world.settle();
  assert.equal(bodyOf(world, "R"), "v3", "the shell's v3 is never replaced by our stale write");
  assert.deepEqual(conflictPaths(), ["Roadmap.omd"]);
  assert.equal(useIdeSyncConflicts.getState().byPageId.R?.theirs, c2);
  assert.equal(syncedHashOf(world.workspaceId, "Roadmap.omd"), await sha16(`${head}v3\n`));
});

test("P2: the agreed file re-emitted after an app edit is ignored — the page keeps the edit, the writer writes it out", async () => {
  const { world } = await syncedRoadmap();
  const base = await world.session.facade.readContent("R");
  await putFile(world.sandbox, world.workspaceId, "Roadmap.omd", base);
  const before = snapshotOf(world);
  world.store.updatePageContent("R", para("app edit"));
  await world.send({ event: "write", path: "Roadmap.omd", hash: await sha16(base), content: b64(base) });
  await world.settle();
  assert.deepEqual(conflictPaths(), []);
  assert.equal(bodyOf(world, "R"), "app edit");
  const writes: string[] = [];
  await writerRound(world, before, writes);
  assert.deepEqual(writes, ["Roadmap.omd"]);
  assert.equal(await fileIn(world, "Roadmap.omd"), await world.session.facade.readContent("R"));
});

test("P2: a code page changed in the app while its file is still at base — ignored, the page keeps the change", async () => {
  useIdeSyncConflicts.getState().clearWorkspace();
  const world = await execWorld([codePage("C", "main.c", "int x;\n")]);
  recordSyncedHash(world.workspaceId, "main.c", await sha16("int x;\n"));
  world.store.updateBlock("C", "code-C", { content: "int y;\n" });
  await world.shellWrite("main.c", "int x;\n");
  assert.deepEqual(conflictPaths(), []);
  assert.equal(bodyOf(world, "C"), "int y;\n");
  assert.equal(syncedHashOf(world.workspaceId, "main.c"), await sha16("int x;\n"));
});

/** inbox/M.omd made from the shell text v1 (no id); returns the new page's id. */
async function shellCreated() {
  useIdeSyncConflicts.getState().clearWorkspace();
  const world = await execWorld([folderPage("I", "inbox")]);
  const before = snapshotOf(world);
  await world.shellWrite("inbox/M.omd", "v1\n");
  return { world, before, id: titled(world, "M")[0]?._id ?? "" };
}

test("C3.5: after a shell create, the writer still rewrites the file with the page's id", async () => {
  const { world, before, id } = await shellCreated();
  const writes: string[] = [];
  await writerRound(world, before, writes);
  assert.deepEqual(writes, ["inbox/M.omd"]);
  assert.equal(await fileIn(world, "inbox/M.omd"), await world.session.facade.readContent(id));
  assert.ok(((await fileIn(world, "inbox/M.omd")) ?? "").includes(`\nid: "${id}"\n`), "the id is in the front matter");
});

test("C3.5: an app edit between two shell writes still conflicts; the page keeps the app's side", async () => {
  const { world, id } = await shellCreated();
  world.store.updatePageContent(id, para("app edit"));
  await world.shellWrite("inbox/M.omd", "v2\n");
  assert.deepEqual(conflictPaths(), ["inbox/M.omd"]);
  assert.equal(bodyOf(world, id), "app edit");
});

test("C3.5: a page object replaced with only a new updatedAt is no change — the shell save applies (finding 19)", async () => {
  const { world, id } = await shellCreated();
  world.store._seed(world.store.pages().map((entry) => (entry._id === id ? { ...entry, updatedAt: "2030-01-01T00:00:00.000Z" } : entry)));
  await world.shellWrite("inbox/M.omd", "v2\n");
  assert.deepEqual(conflictPaths(), []);
  assert.equal(bodyOf(world, id), "v2");
});

test("C3.4: echo stays file-only — a hash equal to the landed page hash but not the ledger goes through the merge", async () => {
  const { world, id } = await shellCreated();
  const pageHash = await sha16(await world.session.facade.readContent(id));
  recordEditorHash(pageHash);
  // The hash alone decides echo; a text the page does not hold shows which row ran.
  await world.send({ event: "write", path: "inbox/M.omd", hash: pageHash, content: b64("v2\n") });
  await world.settle();
  assert.equal(bodyOf(world, id), "v2", "merged and applied, not swallowed as an echo");
});
