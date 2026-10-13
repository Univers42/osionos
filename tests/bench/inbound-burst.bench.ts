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
// pending window (C3b34 18/20).
//
// Measured 2026-10-13 (bash scripts/docker-run.sh test-bench tests/bench/inbound-burst.bench.ts):
// before inboundDrain, one create per event cost one index + tables rebuild — p95 28.74 ms per
// event, 11 922.86 ms per 500-create burst. Edits keep the index and were already in budget
// (p95 1.61 ms, total 467.35 ms). With the drain, the creates of one queue drain share one
// rebuild: 557.24 ms for the burst at 20 lines per message. NOT fixed: one line per message
// with nothing async in between makes every event its own drain — 12 908.25 ms, 8.6× the
// window; that case is a regression guard, not a pass (C3b34 report).
//
// Ponytail: arrival is modelled as `perMessage` lines per socket message, one macrotask
// apart (a 4 KiB PTY read holds ~20 such lines); the real fs-agent framing is not measured
// here. The fixture store adds pages locally — the live store POSTs each page to the server,
// round trips this bench cannot see.

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { recordSyncedHash } from "../../src/features/ide/model/ideSyncEngine.ts";
import { b64, blockPage, execWorld, folderPage } from "../canvas/fixtures/inboundWorld.ts";
import { generatedTree } from "../canvas/page-tree-fixtures.ts";
import { defineBench, type BurstRun } from "./harness.ts";

import type { FsEvent } from "../../src/features/ide/model/ideFsEcho.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

const WORKSPACE_PAGES = 10_000;
const BURST = 500;
// Prefixed: the fixture store names new pages p1, p2… — the same ids generatedTree uses.
const background: PageEntry[] = generatedTree(WORKSPACE_PAGES).map((entry) => ({
  ...entry, _id: `g-${entry._id}`, parentPageId: entry.parentPageId ? `g-${entry.parentPageId}` : null,
}));

type World = Awaited<ReturnType<typeof execWorld>>;

/** A world as a live tab holds it: index and tables already built. */
async function warmWorld(pages: PageEntry[]): Promise<World> {
  const world = await execWorld(pages);
  world.session.view.entryAt(["inbox"]);
  return world;
}

async function writeEvent(path: string, text: string): Promise<FsEvent> {
  return { event: "write", path, hash: await sha16(text), content: b64(text) };
}

const nextMacrotask = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** `perMessage` events per socket message, every line of a message queued at once. */
function arrival(world: World, events: readonly FsEvent[], perMessage: number): BurstRun {
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
  return { deliver, settled: () => world.queue.idle() };
}

/** 500 hand-written files no page owns yet: each one is a create. */
async function createBurst(perMessage: number): Promise<BurstRun> {
  const world = await warmWorld([...background, folderPage("inbox", "inbox")]);
  const events: FsEvent[] = [];
  for (let at = 0; at < BURST; at += 1) {
    events.push(await writeEvent(`inbox/Note ${at}.omd`, `# Note ${at}\n\nChecked out with the rest of the tree, file ${at}.\n`));
  }
  return arrival(world, events, perMessage);
}

/** 500 synced pages, each file edited in the shell: each one is an apply. */
async function editBurst(perMessage: number): Promise<BurstRun> {
  const mine = Array.from({ length: BURST }, (_, at) => blockPage(`edit-${at}`, `Edit ${at}`, "inbox"));
  const world = await warmWorld([...background.slice(0, WORKSPACE_PAGES - BURST - 1), folderPage("inbox", "inbox"), ...mine]);
  const events: FsEvent[] = [];
  for (let at = 0; at < BURST; at += 1) {
    const ours = await world.session.facade.readContent(`edit-${at}`);
    recordSyncedHash(world.workspaceId, `inbox/Edit ${at}.omd`, await sha16(ours));
    events.push(await writeEvent(`inbox/Edit ${at}.omd`, `${ours.slice(0, ours.lastIndexOf("---\n") + 4)}sed -i edit ${at}\n`));
  }
  return arrival(world, events, perMessage);
}

export const bench = defineBench("inbound burst", [
  // 2026-10-13: p95 2.01 ms, total 557.24 ms; 3× → 6 ms per event, the total capped at the 1.5 s window.
  { name: "500 creates into 10k pages, 20 lines/message", budgetNs: 6_000_000, totalBudgetNs: 1_500_000_000, setup: () => createBurst(20) },
  // 2026-10-13: p95 34.10 ms, total 12 908.25 ms — OVER the window (header); 3× as a regression guard.
  { name: "500 creates into 10k pages, 1 line/message", budgetNs: 100_000_000, totalBudgetNs: 39_000_000_000, setup: () => createBurst(1) },
  // 2026-10-13: p95 1.77 ms, total 454.72 ms; 3× → 6 ms per event, the total capped at the 1.5 s window.
  { name: "500 edits in 10k pages, 20 lines/message", budgetNs: 6_000_000, totalBudgetNs: 1_500_000_000, setup: () => editBurst(20) },
]);
