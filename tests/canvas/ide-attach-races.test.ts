/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-attach-races.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Attach racing the app (14', 15): a shell edit is recorded as agreed only when
// the executor applied it, never over a page the app changed after the desired
// snapshot, and a file attach wrote is never left older than its page.

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { useIdeSyncConflicts } from "../../src/features/ide/model/ideSyncConflicts.ts";
import { attach, editedWhileAway, fileIn, hooked, textOf } from "./fixtures/attachWorld.ts";
import { blockPage, execWorld, para } from "./fixtures/inboundWorld.ts";

const conflictOf = (id: string) => useIdeSyncConflicts.getState().byPageId[id];

test("14': an app edit made during attach ends as a conflict — the ledger and the page keep the app's side", async () => {
  useIdeSyncConflicts.getState().clearWorkspace();
  const { world, ours, theirs } = await editedWhileAway();
  const sandbox = hooked(world, "read", "A.omd", () => world.store.updatePageContent("A", para("app edit")));
  await attach(world, sandbox);
  assert.equal(conflictOf("A")?.theirs, theirs);
  assert.equal(syncedHashOf(world.workspaceId, "A.omd"), await sha16(ours), "the ledger is unchanged");
  assert.match(textOf(world, "A"), /app edit/);
  assert.doesNotMatch(textOf(world, "A"), /edited in the shell/);
});

test("14': a rename made during attach — the shell copy at the old name is neither applied nor made a duplicate page", async () => {
  useIdeSyncConflicts.getState().clearWorkspace();
  const { world, theirs } = await editedWhileAway();
  const sandbox = hooked(world, "read", "A.omd", () => world.store.updatePageTitle("A", "Renamed"));
  await attach(world, sandbox);
  assert.equal(world.pageOf("A")?.title, "Renamed");
  assert.deepEqual(world.store.pages().map((entry) => entry._id), ["A"], "no copy of the shell file becomes a page");
  assert.doesNotMatch(textOf(world, "A"), /edited in the shell/);
  assert.equal(conflictOf("A")?.theirs, theirs);
});

test("14': a shell edit the executor refuses (read-only page) is surfaced, never recorded as agreed", async () => {
  useIdeSyncConflicts.getState().clearWorkspace();
  const { world, ours, theirs } = await editedWhileAway();
  world.store.canEdit = () => false;
  const result = await attach(world);
  assert.deepEqual(result.report.inbound.map((file) => file.path), ["A.omd"]);
  assert.equal(conflictOf("A")?.theirs, theirs, "the sandbox side waits in the conflict store");
  assert.equal(syncedHashOf(world.workspaceId, "A.omd"), await sha16(ours));
  assert.doesNotMatch(textOf(world, "A"), /edited in the shell/);
});

test("15: a page edited while attach writes its file — the sandbox ends with the newer version", async () => {
  const world = await execWorld([blockPage("A", "A"), blockPage("B", "B")]);
  const sandbox = hooked(world, "write", "A.omd", () => world.store.updatePageContent("A", para("newer")));
  const result = await attach(world, sandbox);
  assert.match(textOf(world, "A"), /newer/);
  assert.equal(await fileIn(world, "A.omd"), textOf(world, "A"));
  assert.equal(syncedHashOf(world.workspaceId, "A.omd"), await sha16(textOf(world, "A")));
  assert.equal(await fileIn(world, "B.omd"), textOf(world, "B"));
  assert.equal(result.written, 2, "a rewritten path counts once");
});
