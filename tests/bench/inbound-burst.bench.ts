/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inbound-burst.bench.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A 500-file `.omd` burst (a `git checkout`, an untar, a `sed -i` over a tree) landing
// on a 10 000-page workspace, through the real queue, session, planner, executor and
// page-file facade over the fixture store. Budget: the whole burst within the 1.5 s
// pending window (C3b34 18/20); one flush at most 50 ms of main thread (C3b5 C1.4).
//
// Measured 2026-10-13 (bash scripts/docker-run.sh test-bench tests/bench/inbound-burst.bench.ts):
// before inboundDrain, one create per event cost one index + tables rebuild — 11 922.86 ms per
// 500-create burst. The drain alone batched one socket message: 578.80 ms at 20 lines per
// message, 11 570.15 ms at one line per message (one flush per create). With the flush window
// (C3b5 P1), which batches across messages: 61.37 ms at 20 lines per message, 60.03 ms at one;
// one full flush (256 creates over 64 directories) 20.87 ms. Edits 528.52 ms (449.25 ms before
// P3': its page-hash read-back costs ~0.12 ms per apply or create — A/B with it off: edits
// 457.83 ms, one flush 16.19 ms). New directories are made one at a time (ensureDirPage):
// 500 files in 50 new directories 1 296.08 ms, reported without a budget.
//
// Ponytail: arrival is modelled as `perMessage` lines per socket message, one macrotask
// apart; the real fs-agent framing is not measured here. The flush window runs on real
// timers, so a slow box shifts where the deadline cuts a burst. The fixture store adds pages
// locally — the live store POSTs each page to the server, round trips this bench cannot see.
// The one-flush case times the event that trips FLUSH_MAX_CREATES: that event's own plan is
// in the number (an over-estimate of the flush, never an under-estimate).

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { recordSyncedHash } from "../../src/features/ide/model/ideSyncEngine.ts";
import { FLUSH_MAX_CREATES } from "../../src/features/ide/model/inboundDrain.ts";
import { b64, blockPage, execWorld, folderPage } from "../canvas/fixtures/inboundWorld.ts";
import { generatedTree } from "../canvas/page-tree-fixtures.ts";
import { defineBench, type BurstRun } from "./harness.ts";

import type { FsEvent } from "../../src/features/ide/model/ideFsEcho.ts";
import type { Schedule } from "../../src/features/ide/model/inboundPending.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

const WORKSPACE_PAGES = 10_000;
const BURST = 500;
const DIRS = 64;
// Prefixed: the fixture store names new pages p1, p2… — the same ids generatedTree uses.
const background: PageEntry[] = generatedTree(WORKSPACE_PAGES).map((entry) => ({
  ...entry, _id: `g-${entry._id}`, parentPageId: entry.parentPageId ? `g-${entry.parentPageId}` : null,
}));
const existingDirs = Array.from({ length: DIRS }, (_, at) => folderPage(`dir-${at}`, `Dir ${at}`));

type World = Awaited<ReturnType<typeof execWorld>>;

/** Real timers, counted: the drain's flush window runs on the wall clock, as in the app. */
function wallClock(): { schedule: Schedule; armed: () => number } {
  let armed = 0;
  const schedule: Schedule = (run, ms) => {
    let live = true;
    armed += 1;
    const end = (): boolean => {
      if (!live) return false;
      live = false;
      armed -= 1;
      return true;
    };
    const timer = setTimeout(() => { if (end()) run(); }, ms);
    return () => { if (end()) clearTimeout(timer); };
  };
  return { schedule, armed: () => armed };
}

/** A world as a live tab holds it: index and tables already built. `clock`: real timers. */
async function warmWorld(pages: PageEntry[], clock?: ReturnType<typeof wallClock>): Promise<World> {
  const world = await execWorld(pages, clock === undefined ? {} : { schedule: clock.schedule });
  world.session.view.entryAt(["inbox"]);
  return world;
}

async function writeEvent(path: string, text: string): Promise<FsEvent> {
  return { event: "write", path, hash: await sha16(text), content: b64(text) };
}

const nextMacrotask = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
const noteText = (at: number): string => `# Note ${at}\n\nChecked out with the rest of the tree, file ${at}.\n`;

/** Settled on the drain: the queue idle AND no flush window open (C1.4). */
async function drained(world: World, clock: ReturnType<typeof wallClock>): Promise<void> {
  for (;;) {
    await world.queue.idle();
    if (clock.armed() === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

/** `perMessage` events per socket message, every line of a message queued at once. */
function arrival(world: World, clock: ReturnType<typeof wallClock>, events: readonly FsEvent[], perMessage: number): BurstRun {
  const deliver = (): Promise<void>[] => {
    const done: Promise<void>[] = [];
    let ready: Promise<void> = Promise.resolve();
    for (let at = 0; at < events.length; at += perMessage) {
      const sent = ready.then(() => events.slice(at, at + perMessage).map((evt) => world.send(evt)));
      for (let line = 0; line < Math.min(perMessage, events.length - at); line += 1) done.push(sent.then((sends) => sends[line]));
      ready = sent.then(nextMacrotask);
    }
    return done;
  };
  return { deliver, settled: () => drained(world, clock) };
}

/** 500 hand-written files no page owns yet, `pathOf(at)` each: each one is a create. */
async function createBurst(perMessage: number, pathOf = (at: number) => `inbox/Note ${at}.omd`): Promise<BurstRun> {
  const clock = wallClock();
  const world = await warmWorld([...background, folderPage("inbox", "inbox")], clock);
  const events = await Promise.all(Array.from({ length: BURST }, (_, at) => writeEvent(pathOf(at), noteText(at))));
  return arrival(world, clock, events, perMessage);
}

/** 500 synced pages, each file edited in the shell: each one is an apply. */
async function editBurst(perMessage: number): Promise<BurstRun> {
  const clock = wallClock();
  const mine = Array.from({ length: BURST }, (_, at) => blockPage(`edit-${at}`, `Edit ${at}`, "inbox"));
  const world = await warmWorld([...background.slice(0, WORKSPACE_PAGES - BURST - 1), folderPage("inbox", "inbox"), ...mine], clock);
  const events: FsEvent[] = [];
  for (let at = 0; at < BURST; at += 1) {
    const ours = await world.session.facade.readContent(`edit-${at}`);
    recordSyncedHash(world.workspaceId, `inbox/Edit ${at}.omd`, await sha16(ours));
    events.push(await writeEvent(`inbox/Edit ${at}.omd`, `${ours.slice(0, ours.lastIndexOf("---\n") + 4)}sed -i edit ${at}\n`));
  }
  return arrival(world, clock, events, perMessage);
}

/** FLUSH_MAX_CREATES creates over DIRS existing directories: all but the last deferred
 *  untimed (manual clock: no window closes), then the one timed event that flushes them. */
async function oneFullFlush(): Promise<BurstRun> {
  const world = await warmWorld([...background, ...existingDirs]);
  const events = await Promise.all(Array.from({ length: FLUSH_MAX_CREATES }, (_, at) => writeEvent(`Dir ${at % DIRS}/Note ${at}.omd`, noteText(at))));
  for (const evt of events.slice(0, -1)) await world.send(evt);
  const last = events[events.length - 1];
  return { deliver: () => [world.send(last)], settled: () => world.settle() };
}

export const bench = defineBench("inbound burst", [
  // 2026-10-13: p95 17.29 µs, total 61.37 ms. Per event ≈5× (sub-0.1 ms is noise-dominated); total = the window.
  { name: "500 creates into 10k pages, 20 lines/message", budgetNs: 100_000, totalBudgetNs: 1_500_000_000, setup: () => createBurst(20) },
  // 2026-10-13: p95 20.45 µs, total 60.03 ms (11 570.15 ms before the flush window).
  { name: "500 creates into 10k pages, 1 line/message", budgetNs: 100_000, totalBudgetNs: 1_500_000_000, setup: () => createBurst(1) },
  // 2026-10-13: p95 1.87 ms, total 528.52 ms; 3× → 6 ms per event, the total capped at the 1.5 s window.
  { name: "500 edits in 10k pages, 20 lines/message", budgetNs: 6_000_000, totalBudgetNs: 1_500_000_000, setup: () => editBurst(20) },
  // 2026-10-13: 20.87 ms; the budget is C3b5 C1.4's 50 ms per flush (p95 of 5 runs = their max).
  { name: "one flush: 256 creates over 64 existing dirs", budgetNs: 50_000_000, totalBudgetNs: 50_000_000, setup: oneFullFlush },
  // 2026-10-13: p95 22.33 ms (a folder create), total 1 296.08 ms — reported, not gated (C1.4).
  {
    name: "500 creates in 50 new dirs, 1 line/msg (report only)", budgetNs: Number.POSITIVE_INFINITY, totalBudgetNs: Number.POSITIVE_INFINITY,
    setup: () => createBurst(1, (at) => `New ${at % 50}/Note ${at}.omd`),
  },
]);
