/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-refused.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A shell edit the app refuses (condition 13 on the socket path, C3b5 P4/P5): the
// executor is the one owner of the report — one conflict entry, one CONFLICT line,
// on the socket and on attach — and a later save that lands clears it.

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { useIdeOutputBus } from "../../src/features/ide/model/ideOutputBus.ts";
import { recordSyncedHash, syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { useIdeSyncConflicts } from "../../src/features/ide/model/ideSyncConflicts.ts";
import { attach, editedWhileAway, textOf } from "./fixtures/attachWorld.ts";
import { blockPage, execWorld, putFile } from "./fixtures/inboundWorld.ts";

const conflicts = () => useIdeSyncConflicts.getState().byPageId;
const lines = (prefix: string): string[] => useIdeOutputBus.getState().lines.map((line) => line.text).filter((text) => text.startsWith(prefix));
const said = (fragment: string): boolean => useIdeOutputBus.getState().lines.some((line) => line.text.includes(fragment));

/** Roadmap agreed on; the Output and the conflict store start empty. */
async function syncedRoadmap() {
  useIdeSyncConflicts.getState().clearWorkspace();
  useIdeOutputBus.getState().clear();
  const world = await execWorld([blockPage("R", "Roadmap")]);
  const ours = await world.session.facade.readContent("R");
  recordSyncedHash(world.workspaceId, "Roadmap.omd", await sha16(ours));
  return { world, ours, edit: (body: string) => `${ours.slice(0, ours.lastIndexOf("---\n") + 4)}${body}\n` };
}

test("C4.1 socket: a refused apply (read-only page) is one conflict entry with the shell text; the ledger is unchanged", async () => {
  const { world, ours, edit } = await syncedRoadmap();
  world.store.canEdit = (entry) => entry._id !== "R";
  await world.shellWrite("Roadmap.omd", edit("refused"));
  assert.deepEqual(Object.keys(conflicts()), ["R"]);
  assert.equal(conflicts().R?.theirs, edit("refused"));
  assert.equal(conflicts().R?.theirsHash, await sha16(edit("refused")));
  assert.equal(conflicts().R?.relPath, "Roadmap.omd");
  assert.equal(syncedHashOf(world.workspaceId, "Roadmap.omd"), await sha16(ours));
  assert.equal(lines("CONFLICT: Roadmap.omd").length, 1);
});

test("C4.1 attach: a refused apply (read-only page) is one entry and one CONFLICT line", async () => {
  useIdeSyncConflicts.getState().clearWorkspace();
  useIdeOutputBus.getState().clear();
  const { world, theirs } = await editedWhileAway();
  world.store.canEdit = () => false;
  await attach(world);
  assert.deepEqual(Object.keys(conflicts()), ["A"]);
  assert.equal(conflicts().A?.theirs, theirs);
  assert.equal(lines("CONFLICT: A.omd").length, 1);
});

test("P5: attach prints one CONFLICT line when the planner already reported the path (another page's id in it)", async () => {
  useIdeSyncConflicts.getState().clearWorkspace();
  useIdeOutputBus.getState().clear();
  const world = await execWorld([blockPage("A", "A"), blockPage("B", "B")]);
  recordSyncedHash(world.workspaceId, "A.omd", await sha16(textOf(world, "A")));
  await putFile(world.sandbox, world.workspaceId, "A.omd", textOf(world, "B")); // `cp B.omd A.omd` while away
  await attach(world);
  assert.equal(conflicts().A?.theirs, textOf(world, "B"));
  assert.deepEqual(lines("CONFLICT: A.omd").length, 1);
});

test("C4.2: a transient refusal, then a save that applies — the stale entry is resolved", async () => {
  const { world, edit } = await syncedRoadmap();
  world.store.canEdit = () => false;
  await world.shellWrite("Roadmap.omd", edit("refused"));
  assert.ok(conflicts().R !== undefined);
  world.store.canEdit = () => true;
  await world.shellWrite("Roadmap.omd", edit("applied"));
  assert.equal(world.pageOf("R")?.content?.[0]?.content, "applied");
  assert.deepEqual(conflicts(), {}, "take file would have applied the older shell text");
});

test("C4.2: a transient refusal, then the file back at the agreed base (an ignore) — resolved too", async () => {
  const { world, ours, edit } = await syncedRoadmap();
  world.store.canEdit = () => false;
  await world.shellWrite("Roadmap.omd", edit("refused"));
  world.store.canEdit = () => true;
  await world.shellWrite("Roadmap.omd", ours);
  assert.deepEqual(conflicts(), {});
});

test("C4.3: a page gone by the time its apply runs — an Output line says so; no entry, nothing recorded", async () => {
  const { world, ours, edit } = await syncedRoadmap();
  world.store.canEdit = (entry) => {
    if (entry._id === "R") world.store._seed(world.store.pages().filter((page) => page._id !== "R"));
    return entry._id !== "R";
  };
  await world.shellWrite("Roadmap.omd", edit("orphan"));
  assert.ok(said("Roadmap.omd: not applied — the page is gone; the file stays in the sandbox, unsynced"));
  assert.deepEqual(conflicts(), {});
  assert.equal(syncedHashOf(world.workspaceId, "Roadmap.omd"), await sha16(ours));
});

test("conflict store: resolving a page with no open entry notifies nobody (every apply resolves)", () => {
  useIdeSyncConflicts.getState().clearWorkspace();
  let notified = 0;
  const off = useIdeSyncConflicts.subscribe(() => { notified += 1; });
  useIdeSyncConflicts.getState().resolve("nobody");
  off();
  assert.equal(notified, 0);
});
