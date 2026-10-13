/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-drain-window.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The drain's flush window (C3b5 P1): creates from many socket messages share one
// batch, and every task that reads the tree sees the deferred pages first.

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { useIdeOutputBus } from "../../src/features/ide/model/ideOutputBus.ts";
import { recordSyncedHash, syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { useIdeSyncConflicts } from "../../src/features/ide/model/ideSyncConflicts.ts";
import { FLUSH_MAX_CREATES } from "../../src/features/ide/model/inboundDrain.ts";
import { FLUSH_MAX_MS, FLUSH_QUIET_MS } from "../../src/features/ide/model/inboundFlushWindow.ts";
import { INBOUND_WINDOW_MS } from "../../src/features/ide/model/inboundPending.ts";
import { b64, blockPage, execWorld, folderPage, putFile } from "./fixtures/inboundWorld.ts";

import type { FsEvent } from "../../src/features/ide/model/ideFsEcho.ts";

type World = Awaited<ReturnType<typeof execWorld>>;

const said = (fragment: string): boolean => useIdeOutputBus.getState().lines.some((line) => line.text.includes(fragment));
const writeOf = async (path: string, text: string): Promise<FsEvent> => ({ event: "write", path, hash: await sha16(text), content: b64(text) });
const made = (world: World): number => world.store.pages().filter((entry) => entry.title.startsWith("N")).length;
const inboxWorld = () => execWorld([folderPage("I", "inbox"), blockPage("R", "Roadmap")]);

test("R4/C1.3: an archive re-check that runs while a child create is deferred sees the child — Roadmap stays", async () => {
  const world = await execWorld([blockPage("R", "Roadmap")]);
  useIdeOutputBus.getState().clear();
  await world.shellDelete("Roadmap.omd");
  await world.settle();
  await putFile(world.sandbox, world.workspaceId, "Roadmap/a.omd", "child\n");
  let release = (): void => {};
  void world.queue.run(() => new Promise<void>((resolve) => { release = resolve; }));
  const sent = world.send({ event: "write", path: "Roadmap/a.omd", hash: await sha16("child\n"), content: b64("child\n") });
  world.clock.advance(INBOUND_WINDOW_MS); // the re-check is queued behind the waiting write
  release();
  await sent;
  await world.settle();
  const child = world.store.pages().find((entry) => entry.title === "a");
  assert.equal(world.pageOf("R")?.archivedAt ?? null, null, "Roadmap is not archived");
  assert.ok(said("Roadmap.omd: deleted, but Roadmap/ still holds its sub-pages; the page stays"));
  assert.equal(child?.parentPageId, "R");
  assert.equal(child?.archivedAt ?? null, null, "a is a live child");
});

test("C1.1: dispose inside the window disarms it and still makes the deferred page; a create queued after it lands too", async () => {
  const world = await inboxWorld();
  await world.send(await writeOf("inbox/N0.omd", "d\n"));
  assert.equal(world.clock.pendingCount(), 2, "the quiet timer and the deadline are armed");
  world.session.dispose();
  assert.equal(world.clock.pendingCount(), 0, "dispose leaves no timer armed");
  await world.queue.idle();
  assert.equal(made(world), 1, "the flush dispose queued made the page");
  await world.send(await writeOf("inbox/N1.omd", "e\n"));
  await world.queue.idle();
  assert.equal(made(world), 2);
  assert.equal(world.clock.pendingCount(), 0);
});

test("C1.2: create, a non-create forcing the flush, create, deadline — one flush per batch, nothing left deferred", async () => {
  const world = await inboxWorld();
  const ours = await world.session.facade.readContent("R");
  recordSyncedHash(world.workspaceId, "Roadmap.omd", await sha16(ours));
  await world.send(await writeOf("inbox/N0.omd", "a\n"));
  await world.send(await writeOf("Roadmap.omd", `${ours.slice(0, ours.lastIndexOf("---\n") + 4)}edited\n`));
  assert.equal(made(world), 1, "the edit made the deferred page first");
  assert.equal(world.clock.pendingCount(), 0, "and that flush disarmed its window");
  await world.send(await writeOf("inbox/N1.omd", "b\n"));
  assert.equal(world.clock.pendingCount(), 2);
  world.clock.advance(FLUSH_MAX_MS);
  await world.queue.idle();
  assert.equal(world.enqueued.count, 1, "one queued flush, for the second batch only");
  assert.equal(made(world), 2);
  assert.equal(world.clock.pendingCount(), 0);
});

test("P1: creates in separate messages closer than the quiet window share one flush", async () => {
  const world = await inboxWorld();
  for (let at = 0; at < 5; at += 1) {
    await world.send(await writeOf(`inbox/N${at}.omd`, `${at}\n`));
    world.clock.advance(FLUSH_QUIET_MS - 1);
  }
  await world.queue.idle();
  assert.equal(made(world), 0, "the window is still open");
  world.clock.advance(1);
  await world.queue.idle();
  assert.equal(made(world), 5);
  assert.equal(world.enqueued.count, 1);
});

test("P1: a steady trickle never closes the quiet window — the deadline flushes it", async () => {
  const world = await inboxWorld();
  const creates = Math.floor(FLUSH_MAX_MS / (FLUSH_QUIET_MS - 1)) + 1;
  for (let at = 0; at < creates; at += 1) {
    assert.equal(made(world), 0, `nothing made before the deadline (create ${at})`);
    await world.send(await writeOf(`inbox/N${at}.omd`, `${at}\n`));
    world.clock.advance(FLUSH_QUIET_MS - 1);
  }
  await world.queue.idle();
  assert.equal(made(world), creates);
  assert.equal(world.enqueued.count, 1);
  assert.equal(world.clock.pendingCount(), 0);
});

test("P1: FLUSH_MAX_CREATES deferred creates are made at once, inside the event, with no timer", async () => {
  const world = await inboxWorld();
  const events = await Promise.all(Array.from({ length: FLUSH_MAX_CREATES }, (_, at) => writeOf(`inbox/N${at}.omd`, `${at}\n`)));
  await Promise.all(events.map((evt) => world.send(evt)));
  assert.equal(made(world), FLUSH_MAX_CREATES);
  assert.equal(world.enqueued.count, 0);
  assert.equal(world.clock.pendingCount(), 0);
});

test("P1: a newer write at a deferred create's exact path replaces it — one page, the newer text, no conflict", async () => {
  useIdeSyncConflicts.getState().clearWorkspace();
  const world = await inboxWorld();
  await world.send(await writeOf("inbox/N.omd", "first\n"));
  await world.send(await writeOf("inbox/N.omd", "second\n"));
  assert.equal(made(world), 0, "replaced inside the window, not flushed");
  await world.settle();
  const pages = world.store.pages().filter((entry) => entry.title === "N");
  assert.equal(pages.length, 1);
  assert.equal(pages[0]?.content?.[0]?.content, "second");
  assert.equal(syncedHashOf(world.workspaceId, "inbox/N.omd"), await sha16("second\n"));
  assert.deepEqual(useIdeSyncConflicts.getState().byPageId, {});
  assert.equal(world.enqueued.count, 1, "one flush for both writes");
});
