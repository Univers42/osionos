/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-exec-archive.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Deletes, the pending window and moves, end to end through the executor: what
// gets archived (B1), what the ledger remembers (B2, B3), what a failed move
// leaves behind (B4), lifetimes (B5) and queue discipline (B8).

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { useIdeOutputBus } from "../../src/features/ide/model/ideOutputBus.ts";
import { recordSyncedHash, syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { blockPage, codePage, execWorld, folderPage, putFile } from "./fixtures/inboundWorld.ts";
import type { PageEntry } from "../../src/entities/page/model/types.ts";

const said = (fragment: string): boolean => useIdeOutputBus.getState().lines.some((line) => line.text.includes(fragment));
const isLive = (page: PageEntry | undefined): boolean => page !== undefined && !page.archivedAt;

/** A world whose pages are already in the sandbox and agreed on in the ledger. */
async function synced(pages: PageEntry[], opts: Parameters<typeof execWorld>[1] = {}) {
  const world = await execWorld(pages, opts);
  const texts = new Map<string, string>();
  for (const entry of pages) {
    const state = world.session.view.pageState(entry._id);
    if (state?.status !== "live") continue;
    const text = await world.session.facade.readContent(entry._id);
    texts.set(entry._id, text);
    await putFile(world.sandbox, world.workspaceId, state.filePath, text);
    recordSyncedHash(world.workspaceId, state.filePath, await sha16(text));
  }
  return { ...world, texts, textOf: (id: string) => texts.get(id) ?? "" };
}

test("B1: rm A.omd archives only when the window ends and the sandbox says the file is gone", async () => {
  const world = await synced([blockPage("A", "A")]);
  await world.shellDelete("A.omd");
  assert.ok(isLive(world.pageOf("A")), "nothing archives inside the window");
  await world.elapse();
  assert.ok(!isLive(world.pageOf("A")));
});

test("B1: the file back by the end of the window (never re-announced) keeps the page", async () => {
  const world = await synced([blockPage("A", "A")]);
  await world.shellDelete("A.omd");
  await putFile(world.sandbox, world.workspaceId, "A.omd", world.textOf("A"));
  await world.elapse();
  assert.ok(isLive(world.pageOf("A")));
});

test("B1: a sandbox stat that cannot answer keeps the page and says so", async () => {
  const world = await synced([blockPage("A", "A")], { stat: async () => "unknown" });
  useIdeOutputBus.getState().clear();
  await world.shellDelete("A.omd");
  await world.elapse();
  assert.ok(isLive(world.pageOf("A")));
  assert.ok(said("A.omd: could not confirm the delete in the sandbox; the page stays"));
});

test("B1: rm Roadmap.omd with Roadmap/ still holding Child keeps both pages (no cascade) and reports it", async () => {
  const world = await synced([blockPage("R", "Roadmap"), blockPage("c1", "Child", "R")]);
  useIdeOutputBus.getState().clear();
  await world.shellDelete("Roadmap.omd");
  await world.elapse();
  assert.ok(isLive(world.pageOf("R")));
  assert.ok(isLive(world.pageOf("c1")));
  assert.ok(said("Roadmap.omd: deleted, but Roadmap/ still holds its sub-pages; the page stays"));
});

test("B1: a page renamed in the app inside the window is not archived", async () => {
  const world = await synced([blockPage("A", "A")]);
  await world.shellDelete("A.omd");
  world.store.updatePageTitle("A", "Renamed");
  await world.elapse();
  assert.ok(isLive(world.pageOf("A")));
});

test("B2+B3: an archive clears the ledger at the path and remembers its hash; the file coming back restores the SAME page", async () => {
  const world = await synced([blockPage("A", "A")]);
  const agreed = syncedHashOf(world.workspaceId, "A.omd");
  await world.shellDelete("A.omd");
  await world.elapse();
  assert.equal(syncedHashOf(world.workspaceId, "A.omd"), null);
  assert.deepEqual(world.session.view.archivedByInbound("A"), { syncedHash: agreed, path: "A.omd" });
  await world.shellWrite("A.omd", world.textOf("A"));
  assert.ok(isLive(world.pageOf("A")), "restored, not copied");
  assert.equal(world.store.pages().length, 1);
  assert.equal(world.session.view.archivedByInbound("A"), undefined, "the restore memory is spent");
  assert.equal(syncedHashOf(world.workspaceId, "A.omd"), await sha16(world.textOf("A")));
});

// The writer removes an archived page's file only when the file still holds the agreement
// it read when it planned (outboundRun). That agreement must be gone before the store can
// show the page archived, whatever the store awaits: a writer round in between would read
// the old one and remove a file `git clone` had just put back with the same bytes.
test("B2: the agreement at the path is gone before the store is asked to archive the page", async () => {
  const world = await synced([blockPage("A", "A")]);
  const archive = world.store.archivePage;
  const seen: (string | null)[] = [];
  world.store.archivePage = async (id) => { seen.push(syncedHashOf(world.workspaceId, "A.omd")); return archive(id); };
  await world.shellDelete("A.omd");
  await world.elapse();
  assert.ok(!isLive(world.pageOf("A")));
  assert.deepEqual(seen, [null]);
});

// Live VM, 2026-10-14: seven archives answered 502; the store toasted and kept the pages,
// and Output still said each one was in the trash.
test("B2: an archive the store does not apply keeps the page and its agreement, and says so", async () => {
  const world = await synced([blockPage("A", "A")]);
  const agreed = syncedHashOf(world.workspaceId, "A.omd");
  world.store.archivePage = async () => undefined;
  useIdeOutputBus.getState().clear();
  await world.shellDelete("A.omd");
  await world.elapse();
  assert.ok(isLive(world.pageOf("A")));
  assert.equal(syncedHashOf(world.workspaceId, "A.omd"), agreed);
  assert.equal(world.session.view.archivedByInbound("A"), undefined);
  assert.ok(said("A.omd: deleted in the shell, but the page could not be moved to the trash"));
  assert.ok(!said("A.omd: deleted in the shell — the page is in the trash"));
});

test("B2: mv A.omd B.omd ⇒ one page, same id, the ledger leaves A.omd and B.omd records the event hash", async () => {
  const world = await synced([blockPage("A", "A")]);
  await world.shellDelete("A.omd");
  await world.shellWrite("B.omd", world.textOf("A"));
  await world.elapse();
  assert.equal(world.store.pages().length, 1);
  assert.equal(world.pageOf("A")?.title, "B");
  assert.ok(isLive(world.pageOf("A")), "the move cancelled the archive");
  assert.equal(syncedHashOf(world.workspaceId, "A.omd"), null);
  assert.equal(syncedHashOf(world.workspaceId, "B.omd"), await sha16(world.textOf("A")));
});

test("B2: mv src lib ⇒ the folder keeps its id and every agreement under src follows to lib", async () => {
  const world = await synced([folderPage("F", "src"), blockPage("a", "A", "F"), blockPage("b", "B", "F")]);
  await world.shellDelete("src");
  for (const [name, id] of [["A.omd", "a"], ["_folder.omd", "F"], ["B.omd", "b"]]) await world.shellWrite(`lib/${name}`, world.textOf(id));
  await world.elapse();
  assert.equal(world.store.pages().length, 3);
  assert.equal(world.pageOf("F")?.title, "lib");
  assert.ok(["F", "a", "b"].every((id) => isLive(world.pageOf(id))));
  for (const [name, id] of [["A.omd", "a"], ["_folder.omd", "F"], ["B.omd", "b"]]) {
    assert.equal(syncedHashOf(world.workspaceId, `src/${name}`), null, name);
    assert.equal(syncedHashOf(world.workspaceId, `lib/${name}`), await sha16(world.textOf(id)), name);
  }
});

test("Q2: mv src lib with the code file arriving first ⇒ the folder moves on it; no duplicate code page", async () => {
  const world = await synced([folderPage("F", "src"), codePage("m", "main.ts", "print(1)\n", "F"), blockPage("a", "A", "F")]);
  await world.shellDelete("src");
  for (const [name, id] of [["main.ts", "m"], ["_folder.omd", "F"], ["A.omd", "a"]]) await world.shellWrite(`lib/${name}`, world.textOf(id));
  await world.elapse();
  assert.equal(world.store.pages().length, 3);
  assert.equal(world.pageOf("F")?.title, "lib");
  assert.deepEqual(world.session.view.pageState("m"), { status: "live", path: "lib/main.ts", filePath: "lib/main.ts", isFolder: false, parentId: "F" });
  assert.equal(syncedHashOf(world.workspaceId, "lib/main.ts"), await sha16(world.textOf("m")));
});

test("B4: a move that fails after its archive was cancelled says where the file sits unsynced, and records nothing", async () => {
  // `mkdir notes; mv A.omd notes/B.omd` next to Notes.omd: the case-sensitive sandbox holds both,
  // the page tree reserves "notes" case-insensitively for Notes' children, so the folder is refused.
  const world = await synced([blockPage("A", "A"), blockPage("N", "Notes")]);
  useIdeOutputBus.getState().clear();
  await world.shellDelete("A.omd");
  await world.shellWrite("notes/B.omd", world.textOf("A"));
  assert.ok(said("notes/B.omd: not synced — moving A.omd to notes/B.omd failed"));
  assert.ok(said("the file stays in the sandbox, unsynced"));
  assert.equal(syncedHashOf(world.workspaceId, "notes/B.omd"), null);
  await world.elapse();
  assert.ok(isLive(world.pageOf("A")), "its archive was cancelled: the page stays");
  assert.equal(world.pageOf("A")?.title, "A");
  assert.equal(world.store.pages().length, 2, "no copy, no folder");
});

test("B5: disposing the session drops the pending archives — the page outlives the window", async () => {
  const world = await synced([blockPage("A", "A")]);
  await world.shellDelete("A.omd");
  world.session.dispose();
  await world.elapse();
  assert.ok(isLive(world.pageOf("A")));
  assert.equal(world.clock.pendingCount(), 0);
});

test("B8: no step touches the queue — a delete only arms a timer, and its re-check waits behind the task running", async () => {
  const world = await synced([blockPage("A", "A")]);
  await world.shellDelete("A.omd");
  assert.equal(world.enqueued.count, 0, "running the delete's steps enqueued nothing");
  let release = (): void => {};
  const busy = world.queue.run(() => new Promise<void>((resolve) => { release = resolve; }));
  world.clock.advance(1_500);
  assert.equal(world.enqueued.count, 1, "the timer enqueued the re-check");
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(isLive(world.pageOf("A")), "the re-check never runs beside a queued task");
  release();
  await busy;
  await world.queue.idle();
  assert.ok(!isLive(world.pageOf("A")), "then it runs, and archives");
  assert.deepEqual(world.queueErrors, []);
});
