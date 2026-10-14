/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-writer-app-removals.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A refetch that shows a page archived says nothing about the bytes at its path: a `git clone`
// over an `rm -rf` may just have put them back, equal to an agreement this tab still holds.
// Each case below once removed that clone; the writer now removes only a page this tab's user
// removed in the app (store/appRemovals), and every file here is KEPT. The devil's s45p repro
// (2026-10-14), against the real session, queue and writer.
import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { recordSyncedHash, syncedHashOf, takeShellArchived } from "../../src/features/ide/model/ideSyncEngine.ts";
import { statInProvider, type StatResult } from "../../src/features/ide/model/inboundArchive.ts";
import { buildVPath } from "../../src/features/ide/vfs/vpath.ts";
import { planOutbound, type Snapshot } from "../../src/features/page-file/model/outboundPlan.ts";
import { LEFT_WITHOUT_PAGE, runOutbound } from "../../src/features/page-file/model/outboundRun.ts";
import { clearAppRemovals, takeAppRemoval } from "../../src/store/appRemovals.ts";
import { b64, blockPage, execWorld, folderPage, putFile } from "./fixtures/inboundWorld.ts";
import { sandboxIo, snapshotOf, writerRound } from "./fixtures/outboundWorld.ts";

type World = Awaited<ReturnType<typeof execWorld>>;

const present = (w: World, path: string): Promise<boolean> =>
  w.sandbox.read(buildVPath("sandbox", w.workspaceId, path.split("/"))).then(() => true, () => false);

/** One writer round, removing only what this tab's user removed in the app, as in production. */
async function round(w: World, from: Snapshot) {
  const next = snapshotOf(w);
  const byId = new Map(next.pages.map((entry) => [entry._id, entry]));
  const run = await runOutbound({
    workspaceId: w.workspaceId, plan: planOutbound(from, next), io: sandboxIo(w, []),
    pageById: (id) => byId.get(id), pathOf: (id) => next.index.pathForId(id),
    mayRemove: (id) => takeAppRemoval(w.workspaceId, id),
  });
  return run.report;
}

/** The next authoritative fetchPages: the server holds these pages archived. */
const refetchShowsArchived = (w: World, ids: readonly string[]): void =>
  w.store._seed(w.store.pages().map((entry) => (ids.includes(entry._id) ? { ...entry, archivedAt: "2026-10-14T09:00:00Z" } : entry)));

/** proj/ holding one child page whose file and agreement are in place; its stat never answers. */
async function cascadeTree() {
  const forced = new Map<string, StatResult>();
  const w: World = await execWorld([folderPage("P", "proj"), blockPage("c", "child", "P")], {
    stat: async (path) => forced.get(path) ?? statInProvider(w.sandbox, w.workspaceId, path),
  });
  const state = w.session.view.pageState("c");
  const childPath = state?.status === "live" ? state.filePath : "";
  const text = await w.session.facade.readContent("c");
  await putFile(w.sandbox, w.workspaceId, childPath, text);
  recordSyncedHash(w.workspaceId, childPath, await sha16(text));
  forced.set(childPath, "unknown");
  return { w, childPath, text, base: snapshotOf(w) };
}

for (const [name, archive] of [
  ["the store keeps the pages (the 5xx toast path)", async () => undefined],
  ["the archive throws", async () => { throw new Error("BaaS request failed with 504"); }],
] as const) {
  test(`P1, ${name}: the server committed the child archived; after a clone, the refetch keeps the file`, async () => {
    const { w, childPath, text, base } = await cascadeTree();
    w.store.archivePage = archive;
    await w.shellDelete(childPath);
    await w.shellDelete("proj");
    await w.elapse();
    assert.equal(w.pageOf("c")?.archivedAt ?? null, null, "this tab believes the child is live");
    await round(w, base);
    await putFile(w.sandbox, w.workspaceId, childPath, text); // `git clone`: the same bytes
    await w.send({ event: "write", path: childPath, hash: await sha16(text), content: b64(text) });
    await w.settle();
    const before = snapshotOf(w);
    refetchShowsArchived(w, ["c"]);
    const report = await round(w, before);
    assert.deepEqual(report.removed, []);
    assert.equal(await present(w, childPath), true, "the re-cloned file was removed");
  });
}

test("H1: a tab with a stale agreement and none of the closed tab's marks keeps a re-cloned file", async () => {
  const { w, childPath, text, base } = await cascadeTree();
  await w.shellDelete(childPath);
  await w.shellDelete("proj");
  await w.elapse(); // tab A: the cascade, its marks, the agreements cleared
  assert.ok(w.pageOf("c")?.archivedAt);
  await putFile(w.sandbox, w.workspaceId, childPath, text); // the clone, and no event reaches tab B
  // Tab B, leader once A closed: its ledger hydrated before A cleared it, and it holds none of
  // A's marks or intents (both are memory per tab; its writer clears intents as it starts).
  takeShellArchived(w.workspaceId, "c");
  takeShellArchived(w.workspaceId, "P");
  clearAppRemovals(w.workspaceId);
  recordSyncedHash(w.workspaceId, childPath, await sha16(text));
  const report = await round(w, base);
  assert.equal(await present(w, childPath), true, "the handover removed the re-cloned file");
  assert.deepEqual(report.skipped, [{ path: childPath, reason: LEFT_WITHOUT_PAGE }]);
  assert.equal(syncedHashOf(w.workspaceId, childPath), null, "the stale agreement is gone with the round");
});

test("R1: one tab after a reload, its page cache stale and its ledger agreeing, keeps a re-cloned file", async () => {
  const { w, childPath, text, base } = await cascadeTree();
  // Before the reload: the shell deleted the tree, then the clone put the child back.
  await putFile(w.sandbox, w.workspaceId, childPath, text);
  // After it: the quota-stale page cache still shows the child live (base), the ledger still
  // holds its agreement, and the marks and intents were memory. The refetch shows it archived.
  refetchShowsArchived(w, ["c", "P"]);
  const report = await round(w, base);
  assert.deepEqual(report.removed, []);
  assert.equal(await present(w, childPath), true, "the reload removed the re-cloned file");
});

// The leading tab's own `rm -rf proj && git clone`: its archive records intents for every page the
// server names, as the store does, and the round that runs after the clone landed and before its
// deferred create plans the removes. The shell's mark wins over the intent, so the clone stays
// (devil I7 on 709fbea, 2026-10-14).
test("I7a: the leader's own rm -rf and re-clone of a code tree keeps the clone", async () => {
  const src = "int main(void) { return 0; }\n";
  const w: World = await execWorld([]);
  await w.shellWrite("proj/main.c", src);
  const flushed = await writerRound(w, snapshotOf(w), []);
  const child = flushed.index.idForPath("proj/main.c") ?? "";
  await w.shellDelete("proj/main.c");
  await w.shellDelete("proj");
  await w.elapse();
  assert.ok(w.pageOf(child)?.archivedAt, "the shell delete archived the page");
  await putFile(w.sandbox, w.workspaceId, "proj/main.c", src);
  await w.send({ event: "write", path: "proj/main.c", hash: await sha16(src), content: b64(src) });
  const report = await round(w, flushed);
  assert.deepEqual(report.skipped, [{ path: "proj/main.c", reason: "deleted in the shell" }], "the remove was planned, and the mark won");
  assert.equal(await present(w, "proj/main.c"), true, "the leader removed its own clone");
});

test("I7b: the leader's folder cascade onto a block child, then a re-clone, keeps the clone", async () => {
  const { w, childPath, text, base } = await cascadeTree();
  await w.shellDelete(childPath);
  await w.shellDelete("proj");
  await w.elapse();
  assert.ok(w.pageOf("c")?.archivedAt, "the folder's archive reached the child");
  await putFile(w.sandbox, w.workspaceId, childPath, text);
  await w.send({ event: "write", path: childPath, hash: await sha16(text), content: b64(text) });
  const report = await round(w, base);
  assert.deepEqual(report.skipped.filter((skip) => skip.path === childPath), [{ path: childPath, reason: "deleted in the shell" }], "the remove was planned, and the mark won");
  assert.equal(await present(w, childPath), true, "the leader removed the re-cloned child");
});
