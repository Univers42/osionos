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
