/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-attach-session.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Attach over the inbound session: the desired set read from the page index
// (16), the "ready" task applying shell edits without the queue (D1), and a
// shell `rm` undone by a reconnect inside the archive window (D3).

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { recordSyncedHash, syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { useIdeSyncConflicts } from "../../src/features/ide/model/ideSyncConflicts.ts";
import { routeFsEvent } from "../../src/features/ide/model/inboundSession.ts";
import { attach, editedWhileAway, fileIn, textOf } from "./fixtures/attachWorld.ts";
import { blockPage, codePage, execWorld, folderPage, putFile } from "./fixtures/inboundWorld.ts";
import { unloadedPage } from "./page-file-facade-fixtures.ts";
import { attachSummary, loadUnloadedBodies } from "../../src/features/ide/model/materialize.ts";
import { para } from "./fixtures/inboundWorld.ts";

const NOT_LOADED = "page content not loaded, not reconciled";

test("16: every loaded page and code file is written, a folder always as <dir>/_folder.omd, an unloaded page skipped", async () => {
  const world = await execWorld([
    unloadedPage("F", "Docs", null, "folder"), blockPage("A", "Alpha", "F"),
    codePage("C", "main.c", "int x;"), unloadedPage("U", "Later", null),
  ]);
  const result = await attach(world);
  assert.equal(await fileIn(world, "Docs/_folder.omd"), textOf(world, "F"), "a folder needs no body to have a file");
  assert.equal(await fileIn(world, "Docs/Alpha.omd"), textOf(world, "A"));
  assert.equal(await fileIn(world, "main.c"), "int x;");
  assert.equal(await fileIn(world, "Later.omd"), null, "an unloaded page's stand-in never reaches the sandbox");
  assert.deepEqual(result.report.skipped, [{ path: "Later.omd", reason: NOT_LOADED }]);
  assert.deepEqual([result.written, result.unloaded, result.failed], [3, 1, 0], "not loaded is not a failure");
  assert.equal(syncedHashOf(world.workspaceId, "Docs/_folder.omd"), await sha16(textOf(world, "F")));
});

// The attach stopped at the 500th loaded file and counted the rest as FAILED: "329 FAILED" on the
// demo workspace's Output, every reload (2026-10-14).
test("a 501-file tree: every file reaches the sandbox and none is a failure", async () => {
  const pages = Array.from({ length: 501 }, (_, i) => codePage(`C${i}`, `f${i}.c`, `int f${i};`));
  const world = await execWorld(pages);
  const result = await attach(world);
  assert.deepEqual([result.written, result.unloaded, result.known, result.oversize, result.failed], [501, 0, 0, 0, 0]);
  assert.equal(await fileIn(world, "f500.c"), "int f500;");
});

test("an unloaded page this browser synced before is counted apart from one never synced", async () => {
  const world = await execWorld([unloadedPage("K", "Known", null), unloadedPage("N", "New", null)]);
  recordSyncedHash(world.workspaceId, "Known.omd", "0123456789abcdef");
  const result = await attach(world);
  assert.deepEqual([result.written, result.unloaded, result.known, result.failed], [0, 1, 1, 0]);
});

test("the Output line names caps and unloaded pages, and says FAILED only for a failure", () => {
  assert.equal(attachSummary({ written: 3, unloaded: 0, known: 0, oversize: 0, failed: 0 }), "sandbox attached — materialized 3 files");
  assert.equal(
    attachSummary({ written: 0, unloaded: 2358, known: 500, oversize: 2, failed: 1 }),
    "sandbox attached — materialized 0 files, 2358 not loaded (cap 500 per attach), 500 synced before, not re-checked, 2 over 512 KiB, not synced, 1 FAILED",
  );
});

test("bodies attach would skip are fetched first, six at a time, so every page reaches the sandbox", async () => {
  const unloaded = Array.from({ length: 8 }, (_, i) => unloadedPage(`U${i}`, `Page ${i}`, null));
  const world = await execWorld([unloadedPage("F", "Docs", null, "folder"), blockPage("A", "Alpha", "F"), ...unloaded]);
  const asked: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const count = await loadUnloadedBodies(world.session.views, async (id) => {
    asked.push(id);
    maxInFlight = Math.max(maxInFlight, (inFlight += 1));
    await new Promise((resolve) => setTimeout(resolve, 1));
    world.store.updatePageContent(id, para(`body ${id}`));
    inFlight -= 1;
  });
  assert.equal(count, 8);
  assert.deepEqual(asked.sort(), unloaded.map((entry) => entry._id).sort(), "never a folder, never a loaded page");
  assert.ok(maxInFlight <= 6, `at most six at once (saw ${maxInFlight})`);
  const result = await attach(world);
  assert.deepEqual([result.written, result.unloaded, result.failed], [10, 0, 0]);
  assert.equal(await fileIn(world, "Page 3.omd"), textOf(world, "U3"));
});

test("a body is fetched only for a path this browser never synced: a reload costs no fetch", async () => {
  const world = await execWorld([unloadedPage("K", "Known", null), unloadedPage("N", "New", null)]);
  recordSyncedHash(world.workspaceId, "Known.omd", await sha16("agreed earlier"));
  const asked: string[] = [];
  const count = await loadUnloadedBodies(world.session.views, async (id) => { asked.push(id); }, (path) => syncedHashOf(world.workspaceId, path) !== null);
  assert.deepEqual([count, asked], [1, ["N"]]);
});

test("a body that fails to load stays unloaded and attach still skips it", async () => {
  const world = await execWorld([unloadedPage("U", "Later", null)]);
  await loadUnloadedBodies(world.session.views, async () => { throw new Error("offline"); });
  const result = await attach(world);
  assert.deepEqual([result.written, result.unloaded, result.failed], [0, 1, 0]);
});

test("16: no ledger and a _folder.omd that differs only by a legacy updated: line — rewritten, not a conflict", async () => {
  useIdeSyncConflicts.getState().clearWorkspace();
  const world = await execWorld([folderPage("F", "Docs"), blockPage("A", "Alpha", "F")]);
  const today = textOf(world, "F");
  await putFile(world.sandbox, world.workspaceId, "Docs/_folder.omd", today.replace("---\n", '---\nupdated: "2026-10-14T02:28:44.444275+00:00"\n'));
  const result = await attach(world);
  assert.deepEqual(result.report.conflicts, [], "106 such folders were 106 conflicts after one clone");
  assert.equal(await fileIn(world, "Docs/_folder.omd"), today, "the sandbox copy takes today's form");
  assert.equal(useIdeSyncConflicts.getState().byPageId.F, undefined);
});

test("16: a _folder.omd changed on both sides is reported under its folder's id", async () => {
  useIdeSyncConflicts.getState().clearWorkspace();
  const world = await execWorld([folderPage("F", "Docs"), blockPage("A", "Alpha", "F")]);
  const shell = "---\ntitle: \"Docs\"\nicon: \"x\"\n---\n";
  recordSyncedHash(world.workspaceId, "Docs/_folder.omd", await sha16("an older agreement"));
  await putFile(world.sandbox, world.workspaceId, "Docs/_folder.omd", shell);
  const result = await attach(world);
  assert.deepEqual(result.report.conflicts.map((conflict) => conflict.path), ["Docs/_folder.omd"]);
  assert.equal(useIdeSyncConflicts.getState().byPageId.F?.relPath, "Docs/_folder.omd");
  assert.equal(useIdeSyncConflicts.getState().byPageId.F?.theirs, shell);
});

test("16: no ledger and a loaded EMPTY code page — the sandbox copy wins; an unloaded one is never touched", async () => {
  const world = await execWorld([codePage("E", "empty.c", ""), unloadedPage("U", "later.c", null, "code")]);
  await putFile(world.sandbox, world.workspaceId, "empty.c", "int y;\n");
  await putFile(world.sandbox, world.workspaceId, "later.c", "int z;\n");
  const result = await attach(world);
  assert.equal(textOf(world, "E"), "int y;\n", "the empty page takes the sandbox copy");
  assert.equal(syncedHashOf(world.workspaceId, "empty.c"), await sha16("int y;\n"));
  assert.equal(world.pageOf("U")?.content, undefined, "an unloaded page is neither empty nor applied");
  assert.deepEqual(result.report.skipped, [{ path: "later.c", reason: NOT_LOADED }]);
});

test("D1: the queued ready task applies a shell edit made while away — directly, so the queue drains", async () => {
  const { world, theirs } = await editedWhileAway();
  const route = {
    isLeader: () => true, queue: world.queue, session: world.session,
    attach: async () => { await attach(world); },
  };
  routeFsEvent({ event: "ready", path: "" }, route);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadlock = new Promise<string>((resolve) => { timer = setTimeout(() => resolve("deadlock"), 2000); });
  const settled = await Promise.race([world.queue.idle().then(() => "drained"), deadlock]);
  clearTimeout(timer);
  assert.equal(settled, "drained");
  assert.match(textOf(world, "A"), /edited in the shell/);
  assert.equal(syncedHashOf(world.workspaceId, "A.omd"), await sha16(theirs));
  assert.deepEqual(world.queueErrors, []);
});

test("D3: rm A.omd, then a reconnect inside the window — attach recreates the file and the page stays live", async () => {
  const world = await execWorld([blockPage("A", "A")]);
  const ours = textOf(world, "A");
  await putFile(world.sandbox, world.workspaceId, "A.omd", ours);
  recordSyncedHash(world.workspaceId, "A.omd", await sha16(ours));
  await world.shellDelete("A.omd");
  await world.queue.run(async () => { await attach(world); });
  assert.equal(await fileIn(world, "A.omd"), ours, "attach recreates the file");
  await world.elapse();
  assert.equal(world.pageOf("A")?.archivedAt ?? null, null, "the timer's re-check finds the file");
});
