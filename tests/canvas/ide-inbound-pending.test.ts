/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-pending.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The inbound executor's pending state on its own: archive timers, the deleted-
// directory set (move evidence) and the archived-by-inbound restore memory.

import assert from "node:assert/strict";
import test from "node:test";

import {
  ARCHIVED_BY_INBOUND_CAP, INBOUND_WINDOW_MS, createInboundPending,
} from "../../src/features/ide/model/inboundPending.ts";
import type { ArchiveTicket } from "../../src/features/ide/model/inboundPending.ts";
import { createFakeClock } from "./fixtures/fakeClock.ts";

/** A pending store whose queued tasks are collected, so a test runs them when it wants. */
function harness() {
  const clock = createFakeClock();
  const queued: (() => Promise<void>)[] = [];
  const pending = createInboundPending({ schedule: clock.schedule, enqueue: (task) => { queued.push(task); } });
  const drain = async (): Promise<void> => { while (queued.length > 0) await queued.shift()?.(); };
  return { clock, pending, queued, drain };
}

test("window: a scheduled archive is due after INBOUND_WINDOW_MS, through the queue, and stays pending until claimed", async () => {
  const { clock, pending, queued, drain } = harness();
  const due: ArchiveTicket[] = [];
  pending.schedule("A", "A.omd", async (ticket) => { due.push(ticket); });
  clock.advance(INBOUND_WINDOW_MS - 1);
  assert.equal(queued.length, 0, "not due inside the window");
  clock.advance(1);
  assert.equal(queued.length, 1, "the due archive is QUEUED, never run from the timer");
  assert.equal(pending.hasOwn("A"), true, "an event drained before the re-check still sees the pending archive");
  await drain();
  assert.equal(due.length, 1);
  assert.equal(pending.claim(due[0]), true, "the first claim wins");
  assert.equal(pending.hasOwn("A"), false);
  assert.equal(pending.claim(due[0]), false, "a ticket is claimed once");
});

test("cancel: a cancelled archive never comes due, and a stale ticket from before a reschedule is refused", async () => {
  const { clock, pending, drain } = harness();
  const due: ArchiveTicket[] = [];
  pending.schedule("A", "A.omd", async (ticket) => { due.push(ticket); });
  pending.cancel("A");
  clock.advance(INBOUND_WINDOW_MS);
  await drain();
  assert.deepEqual(due, []);
  pending.schedule("A", "A.omd", async (ticket) => { due.push(ticket); });
  clock.advance(INBOUND_WINDOW_MS);
  pending.cancel("A");
  pending.schedule("A", "B.omd", async (ticket) => { due.push(ticket); });
  await drain();
  assert.equal(due.length, 1, "the first timer had fired before the cancel");
  assert.equal(pending.claim(due[0]), false, "its ticket predates the reschedule");
  assert.equal(pending.hasOwn("A"), true, "the new schedule stands");
});

test("deleted dirs: the DEEPEST registered directory covering a path, in O(depth); it expires with the window", async () => {
  const { clock, pending, drain } = harness();
  pending.addDeletedDir({ path: "src", role: "folder-dir", ownerId: "F" });
  pending.addDeletedDir({ path: "src/lib", role: "folder-dir", ownerId: "L" });
  assert.deepEqual(pending.deepestDeletedDir("src/lib/a.omd"), { path: "src/lib", role: "folder-dir", ownerId: "L" });
  assert.deepEqual(pending.deepestDeletedDir("src/b.omd"), { path: "src", role: "folder-dir", ownerId: "F" });
  assert.equal(pending.deepestDeletedDir("srcx/b.omd"), undefined, "a name prefix is not a directory prefix");
  assert.equal(pending.deepestDeletedDir("src"), undefined, "the directory itself is not inside itself");
  assert.equal(pending.deletedDirs().length, 2);
  clock.advance(INBOUND_WINDOW_MS);
  await drain();
  assert.equal(pending.deepestDeletedDir("src/b.omd"), undefined);
  assert.deepEqual(pending.deletedDirs(), []);
});

test("B3: archivedByInbound keeps the whole session, least-recently-used evicted past the cap", () => {
  const { pending } = harness();
  for (let i = 0; i < ARCHIVED_BY_INBOUND_CAP; i++) pending.rememberArchived(`p${i}`, { syncedHash: `h${i}`, path: `p${i}.omd` });
  assert.deepEqual(pending.archived("p0"), { syncedHash: "h0", path: "p0.omd" }, "reading p0 makes it the most recent");
  pending.rememberArchived("extra", { syncedHash: null, path: "extra.omd" });
  assert.equal(pending.archived("p1"), undefined, "p1 was the least recently used");
  assert.notEqual(pending.archived("p0"), undefined);
  assert.notEqual(pending.archived("extra"), undefined);
  pending.forgetArchived("extra");
  assert.equal(pending.archived("extra"), undefined);
});

test("B5: dispose drops every timer and the restore memory; a task queued before it does nothing", async () => {
  const { clock, pending, drain } = harness();
  const due: ArchiveTicket[] = [];
  pending.schedule("A", "A.omd", async (ticket) => { due.push(ticket); });
  pending.schedule("B", "B.omd", async (ticket) => { due.push(ticket); });
  pending.addDeletedDir({ path: "src", role: "folder-dir", ownerId: "F" });
  pending.rememberArchived("C", { syncedHash: "h", path: "C.omd" });
  clock.advance(INBOUND_WINDOW_MS);
  pending.dispose();
  assert.equal(clock.pendingCount(), 0);
  await drain();
  assert.deepEqual(due, [], "a due archive queued before the dispose never reaches the executor");
  assert.equal(pending.hasOwn("A"), false);
  assert.equal(pending.archived("C"), undefined);
  assert.equal(pending.deepestDeletedDir("src/a.omd"), undefined);
  pending.schedule("D", "D.omd", async (ticket) => { due.push(ticket); });
  assert.equal(clock.pendingCount(), 0, "a disposed store schedules nothing");
});

test("duePaths: a path is listed from its window's end until its archive is claimed, cancelled or rescheduled", async () => {
  const { clock, pending, drain } = harness();
  const due: ArchiveTicket[] = [];
  for (const id of ["A", "B", "C"]) pending.schedule(id, `${id}.omd`, async (ticket) => { due.push(ticket); });
  assert.deepEqual(pending.duePaths(), [], "nothing is due inside the window");
  clock.advance(INBOUND_WINDOW_MS);
  assert.deepEqual(pending.duePaths(), ["A.omd", "B.omd", "C.omd"]);
  await drain();
  assert.equal(pending.claim(due[0]), true);
  pending.cancel("B");
  pending.schedule("C", "C2.omd", async () => undefined);
  assert.deepEqual(pending.duePaths(), [], "claimed, cancelled, rescheduled: none still due");
  pending.dispose();
});
