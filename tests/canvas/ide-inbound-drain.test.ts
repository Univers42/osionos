/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-drain.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Creates wait for the end of their flush window and land as one batch (one index
// build, 18/20); anything that could see the difference flushes first.

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { useIdeOutputBus } from "../../src/features/ide/model/ideOutputBus.ts";
import { recordSyncedHash, syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { useIdeSyncConflicts } from "../../src/features/ide/model/ideSyncConflicts.ts";
import { b64, blockPage, execWorld, folderPage } from "./fixtures/inboundWorld.ts";

import type { PageEntry } from "../../src/entities/page/model/types.ts";
import type { FsEvent } from "../../src/features/ide/model/ideFsEcho.ts";

type World = Awaited<ReturnType<typeof execWorld>>;

const said = (fragment: string): boolean => useIdeOutputBus.getState().lines.some((line) => line.text.includes(fragment));
const titled = (world: World, title: string): PageEntry[] => world.store.pages().filter((entry) => entry.title === title && !entry.archivedAt);
const bodyOf = (entry: PageEntry | undefined): string => JSON.stringify(entry?.content ?? []);

const writeOf = async (path: string, text: string): Promise<FsEvent> => ({ event: "write", path, hash: await sha16(text), content: b64(text) });

/** Queues every event in one synchronous pass, as one socket message queues all its lines. */
const queueAll = (world: World, events: readonly FsEvent[]): Promise<void>[] => events.map((evt) => world.send(evt));

test("drain: five creates queued together are made by one flush when the window ends, each with its ledger", async () => {
  const world = await execWorld([folderPage("I", "inbox")]);
  const sent = queueAll(world, await Promise.all([0, 1, 2, 3, 4].map((at) => writeOf(`inbox/N${at}.omd`, `note ${at}\n`))));
  await sent[4];
  assert.equal(world.store.pages().length, 1, "no page before the drain ends");
  await world.settle();
  assert.equal(world.store.pages().length, 6);
  assert.equal(world.enqueued.count, 1, "one flush task for the whole drain");
  for (const at of [0, 1, 2, 3, 4]) assert.equal(syncedHashOf(world.workspaceId, `inbox/N${at}.omd`), await sha16(`note ${at}\n`));
});

test("drain: a second write to a deferred path flushes first — one page, never two, and no false conflict", async () => {
  useIdeSyncConflicts.getState().clearWorkspace();
  const world = await execWorld([folderPage("I", "inbox")]);
  queueAll(world, [await writeOf("inbox/N.omd", "first\n"), await writeOf("inbox/n.omd", "case variant\n"), await writeOf("inbox/N.omd", "second\n")]);
  await world.settle();
  assert.equal(titled(world, "N").length, 1);
  assert.equal(titled(world, "n").length, 0);
  assert.ok(said("inbox/n.omd: differs only in letter case"), "the case variant met the page, as without a batch");
  assert.ok(!said("inbox/N.omd: no page created"), "the second write met the page instead of a second create");
  assert.deepEqual(useIdeSyncConflicts.getState().byPageId, {}, "the second write applied over the page the first one made");
  assert.match(bodyOf(titled(world, "N")[0]), /second/);
});

test("drain: a file under a deferred page's children dir lands under that page, no folder made (17)", async () => {
  const world = await execWorld([folderPage("I", "inbox")]);
  queueAll(world, [await writeOf("inbox/N.omd", "parent\n"), await writeOf("inbox/N/Child.omd", "child\n")]);
  await world.settle();
  const named = titled(world, "N");
  assert.deepEqual(named.map((entry) => entry.surface), ["page"], "N is the block page, and no folder N was made");
  assert.equal(titled(world, "Child")[0]?.parentPageId, named[0]?._id);
  assert.equal(world.store.pages().length, 3);
});

test("drain: a delete of a deferred path flushes first, then arms the window like any delete", async () => {
  const world = await execWorld([folderPage("I", "inbox")]);
  queueAll(world, [await writeOf("inbox/N.omd", "gone soon\n"), { event: "delete", path: "inbox/N.omd" }]);
  await world.queue.idle();
  assert.equal(titled(world, "N").length, 1, "made, then pending");
  await world.elapse();
  assert.equal(titled(world, "N").length, 0, "archived when the window ends");
});

test("drain: an edit of an existing page waits for the creates queued before it", async () => {
  const world = await execWorld([folderPage("I", "inbox"), blockPage("R", "Roadmap")]);
  const ours = await world.session.facade.readContent("R");
  recordSyncedHash(world.workspaceId, "Roadmap.omd", await sha16(ours));
  const [, edit] = queueAll(world, [await writeOf("inbox/N.omd", "new\n"), await writeOf("Roadmap.omd", `${ours.slice(0, ours.lastIndexOf("---\n") + 4)}edited\n`)]);
  await edit;
  assert.equal(titled(world, "N").length, 1, "the batch landed before the edit ran");
  assert.match(bodyOf(world.pageOf("R")), /edited/);
});

test("drain: attach's direct run flushes the deferred creates before it plans", async () => {
  const world = await execWorld([folderPage("I", "inbox")]);
  const child = { kind: "write" as const, path: "inbox/N/Child.omd", text: "child\n", hash: await sha16("child\n") };
  queueAll(world, [await writeOf("inbox/N.omd", "parent\n")]);
  void world.queue.run(async () => { await world.session.run(child); });
  await world.queue.idle();
  const named = titled(world, "N");
  assert.deepEqual(named.map((entry) => entry.surface), ["page"], "N was made before the run planned, so no folder N");
  assert.equal(titled(world, "Child")[0]?.parentPageId, named[0]?._id);
});

test("drain: a create the batch refuses is reported with the create line; the rest of the batch lands", async () => {
  const world = await execWorld([folderPage("I", "inbox"), blockPage("P", "Plan", "I")]);
  queueAll(world, [await writeOf("inbox/plan", "a file named like Plan's children dir\n"), await writeOf("inbox/Other.omd", "fine\n")]);
  await world.settle();
  assert.ok(said("inbox/plan: no page created — AlreadyExists"));
  assert.equal(titled(world, "Other").length, 1);
  assert.equal(syncedHashOf(world.workspaceId, "inbox/plan"), null);
});
