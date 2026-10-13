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

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { recordSyncedHash, syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
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
