/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-shell-marks.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The marks and agreements an inbound archive holds for the writer (inboundArchive archiveNow),
// across the store refusing, throwing, cascading and restoring. The devil's s45n attack cases
// (2026-10-14), each against the real session, queue and writer.

import assert from "node:assert/strict";
import test from "node:test";

import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { useIdeOutputBus } from "../../src/features/ide/model/ideOutputBus.ts";
import { recordSyncedHash, syncedHashOf, takeShellArchived } from "../../src/features/ide/model/ideSyncEngine.ts";
import { statInProvider, type StatResult } from "../../src/features/ide/model/inboundArchive.ts";
import { buildVPath } from "../../src/features/ide/vfs/vpath.ts";
import { planOutbound, type Snapshot } from "../../src/features/page-file/model/outboundPlan.ts";
import { runOutbound } from "../../src/features/page-file/model/outboundRun.ts";
import { recordAppRemovals, takeAppRemoval } from "../../src/store/appRemovals.ts";
import { b64, blockPage, execWorld, folderPage, putFile } from "./fixtures/inboundWorld.ts";
import { sandboxIo, snapshotOf, writerRound } from "./fixtures/outboundWorld.ts";

type World = Awaited<ReturnType<typeof execWorld>>;

const src = "int\tmain(void)\n{\n\treturn (0);\n}\n";
const present = (w: World, path: string): Promise<boolean> =>
  w.sandbox.read(buildVPath("sandbox", w.workspaceId, path.split("/"))).then(() => true, () => false);
const said = (fragment: string): boolean => useIdeOutputBus.getState().lines.some((line) => line.text.includes(fragment));

async function round(w: World, from: Snapshot) {
  const next = snapshotOf(w);
  const byId = new Map(next.pages.map((entry) => [entry._id, entry]));
  const run = await runOutbound({
    workspaceId: w.workspaceId, plan: planOutbound(from, next), io: sandboxIo(w, []),
    pageById: (id) => byId.get(id), pathOf: (id) => next.index.pathForId(id),
    mayRemove: (id) => takeAppRemoval(w.workspaceId, id),
  });
  return { next, report: run.report };
}

/** What the store's archive does once the server confirmed: the intent, then the page. */
const appArchive = (w: World, id: string): void => {
  recordAppRemovals(w.workspaceId, [id]);
  w.store._seed(w.store.pages().map((entry) => (entry._id === id ? { ...entry, archivedAt: "2026-10-14T09:00:00Z" } : entry)));
};

/** proj/main.c made in the shell, its page and folder written back once. */
async function codeTree() {
  const w = await execWorld([]);
  await w.shellWrite("proj/main.c", src);
  const flushed = await writerRound(w, snapshotOf(w), []);
  return { w, flushed, child: flushed.index.idForPath("proj/main.c") ?? "", dir: flushed.index.idForPath("proj") ?? "" };
}

/** Folder P with block child c, the child's own check held "unknown" so only the folder's archive reaches it. */
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

test("A1: an archive the store refuses leaves no mark on any page of the subtree", async () => {
  const { w, child, dir } = await codeTree();
  w.store.archivePage = async () => undefined;
  await w.shellDelete("proj/main.c");
  await w.shellDelete("proj");
  await w.elapse();
  assert.equal(w.pageOf(child)?.archivedAt ?? null, null);
  assert.equal(takeShellArchived(w.workspaceId, dir), false, "folder unmarked");
  assert.equal(takeShellArchived(w.workspaceId, child), false, "child unmarked");
});

test("A2: an archive that throws gives the mark and the agreement back; a later app delete removes the file", async () => {
  const { w, child } = await codeTree();
  const agreed = syncedHashOf(w.workspaceId, "proj/main.c");
  const archive = w.store.archivePage;
  w.store.archivePage = async () => { throw new Error("PermissionDenied"); };
  useIdeOutputBus.getState().clear();
  await w.shellDelete("proj/main.c");
  await w.elapse();
  assert.equal(w.pageOf(child)?.archivedAt ?? null, null, "the page stays live");
  assert.equal(syncedHashOf(w.workspaceId, "proj/main.c"), agreed);
  assert.ok(said("proj/main.c: the page was not archived — PermissionDenied"));
  w.store.archivePage = archive;
  await w.shellWrite("proj/main.c", src);
  const before = snapshotOf(w);
  appArchive(w, child);
  const { report } = await round(w, before);
  assert.deepEqual(report.removed, ["proj/main.c"]);
  assert.equal(await present(w, "proj/main.c"), false);
});

test("A4: an .omd cloned back restores its page and drops its mark; a later app delete removes the file", async () => {
  const w = await execWorld([blockPage("R", "Roadmap")]);
  const text = await w.session.facade.readContent("R");
  await putFile(w.sandbox, w.workspaceId, "Roadmap.omd", text);
  recordSyncedHash(w.workspaceId, "Roadmap.omd", await sha16(text));
  await writerRound(w, snapshotOf(w), []);
  await w.shellDelete("Roadmap.omd");
  await w.elapse();
  assert.ok(w.pageOf("R")?.archivedAt, "archived by the shell delete");
  await putFile(w.sandbox, w.workspaceId, "Roadmap.omd", text);
  await w.send({ event: "write", path: "Roadmap.omd", hash: await sha16(text), content: b64(text) });
  await w.settle();
  assert.equal(w.pageOf("R")?.archivedAt ?? null, null, "restored by the clone");
  const before = snapshotOf(w);
  appArchive(w, "R");
  const { report } = await round(w, before);
  assert.ok(!report.skipped.some((item) => item.reason === "deleted in the shell"), "no stale mark held the user's delete");
  assert.deepEqual(report.removed, ["Roadmap.omd"]);
});

test("A6: a cascaded child restored in the app gets its file written back", async () => {
  const { w, childPath, base } = await cascadeTree();
  await w.shellDelete(childPath);
  await w.shellDelete("proj");
  await w.elapse();
  assert.ok(w.pageOf("c")?.archivedAt, "the folder's archive reached the child");
  assert.equal(syncedHashOf(w.workspaceId, childPath), null);
  const first = await round(w, base);
  w.store._seed(w.store.pages().map((entry) => ({ ...entry, archivedAt: null })));
  await round(w, first.next);
  assert.equal(await present(w, childPath), true);
});

// F6: the writer may run the moment the store shows the cascade, before archiveNow resumes.
test("F6: a cascaded child is marked and forgets its agreement before the store shows it archived", async () => {
  const { w, childPath, text, base } = await cascadeTree();
  const archive = w.store.archivePage;
  let mid: Awaited<ReturnType<typeof round>> | undefined;
  w.store.archivePage = async (id) => {
    await archive(id);
    await putFile(w.sandbox, w.workspaceId, childPath, text); // `git clone` put the same bytes back
    mid = await round(w, base);
  };
  await w.shellDelete(childPath);
  await w.shellDelete("proj");
  await w.elapse();
  assert.ok(w.pageOf("c")?.archivedAt, "the folder's archive reached the child");
  assert.deepEqual(mid?.report.removed, []);
  assert.ok(mid?.report.skipped.some((item) => item.path === childPath && item.reason === "deleted in the shell"));
  assert.equal(await present(w, childPath), true);
});
