/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-attach-reconcile.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";

import { reconcileOnAttach, ATTACH_PAGE_FILES, MAX_ATTACH_FILE_BYTES, OVERSIZE_REASON } from "../../src/features/ide/model/reconcileOnAttach.ts";
import { recordSyncedHash, syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { sha16, isEchoHash } from "../../src/features/ide/model/ideFsEcho.ts";
import { instrumented, readBytes, readText, seeded } from "./ide-attach-fixtures.ts";
import type { FsProvider } from "../../src/features/ide/vfs/types.ts";

// The ledger is module-level, so every test reconciles its own workspace id.
let wsCounter = 0;
const freshWs = (): string => `ws-reconcile-${(wsCounter += 1)}`;
const none = { written: [], recorded: [], inbound: [], conflicts: [], skipped: [] };

test("rule: sandbox copy missing → write ours, record hash(ours), register the echo", async () => {
  const ws = freshWs();
  const { provider } = instrumented();
  const content = `int main(){} // ${ws}`;
  const report = await reconcileOnAttach({ workspaceId: ws, provider, desired: [{ path: "src/main.c", content }] });
  assert.deepEqual(report, { ...none, written: ["src/main.c"] });
  assert.equal(await readText(provider, "src/main.c"), content);
  assert.equal(syncedHashOf(ws, "src/main.c"), await sha16(content));
  assert.equal(isEchoHash(await sha16(content)), true, "the fs-agent's re-emission must be suppressed");
});

test("rule: hash(theirs) == hash(ours) → record only, nothing written", async () => {
  const ws = freshWs();
  const { provider, stats } = await seeded({ "a.c": "same" });
  const report = await reconcileOnAttach({ workspaceId: ws, provider, desired: [{ path: "a.c", content: "same" }] });
  assert.deepEqual(report, { ...none, recorded: ["a.c"] });
  assert.deepEqual(stats.writes, []);
  assert.equal(syncedHashOf(ws, "a.c"), await sha16("same"));
});

test("rule: ledger == hash(theirs) → only ours changed → write ours, record", async () => {
  const ws = freshWs();
  const { provider } = await seeded({ "a.c": "v1" });
  recordSyncedHash(ws, "a.c", await sha16("v1"));
  const report = await reconcileOnAttach({ workspaceId: ws, provider, desired: [{ path: "a.c", content: "v2" }] });
  assert.deepEqual(report, { ...none, written: ["a.c"] });
  assert.equal(await readText(provider, "a.c"), "v2");
  assert.equal(syncedHashOf(ws, "a.c"), await sha16("v2"));
});

test("rule: ledger == hash(ours) → only the sandbox changed (shell edit while away) → inbound, never written", async () => {
  const ws = freshWs();
  const { provider, stats } = await seeded({ "a.c": "shell edit" });
  recordSyncedHash(ws, "a.c", await sha16("v1"));
  const report = await reconcileOnAttach({ workspaceId: ws, provider, desired: [{ path: "a.c", content: "v1" }] });
  assert.deepEqual(report, { ...none, inbound: [{ path: "a.c", content: "shell edit" }] });
  assert.deepEqual(stats.writes, []);
  assert.equal(await readText(provider, "a.c"), "shell edit");
  assert.equal(syncedHashOf(ws, "a.c"), await sha16("v1"), "the caller records once it applies the inbound copy");
});

test("rule: no ledger + tiebreak 'ours' → write and record", async () => {
  const ws = freshWs();
  const { provider } = await seeded({ "a.c": "theirs" });
  const calls: [string, string][] = [];
  const tiebreak = (path: string, theirs: string) => { calls.push([path, theirs]); return "ours" as const; };
  const report = await reconcileOnAttach({ workspaceId: ws, provider, desired: [{ path: "a.c", content: "ours" }], tiebreak });
  assert.deepEqual(calls, [["a.c", "theirs"]]);
  assert.deepEqual(report, { ...none, written: ["a.c"] });
  assert.equal(await readText(provider, "a.c"), "ours");
  assert.equal(syncedHashOf(ws, "a.c"), await sha16("ours"));
});

test("rule: no ledger + tiebreak 'theirs' → inbound, never written", async () => {
  const ws = freshWs();
  const { provider, stats } = await seeded({ "a.c": "theirs" });
  const report = await reconcileOnAttach({ workspaceId: ws, provider, desired: [{ path: "a.c", content: "ours" }], tiebreak: () => "theirs" });
  assert.deepEqual(report, { ...none, inbound: [{ path: "a.c", content: "theirs" }] });
  assert.deepEqual(stats.writes, []);
  assert.equal(syncedHashOf(ws, "a.c"), null);
});

test("rule: no ledger + tiebreak null or absent → conflict, never written", async () => {
  for (const tiebreak of [() => null, undefined]) {
    const ws = freshWs();
    const { provider, stats } = await seeded({ "a.c": "theirs" });
    const report = await reconcileOnAttach({ workspaceId: ws, provider, desired: [{ path: "a.c", content: "ours" }], tiebreak });
    assert.deepEqual(report, { ...none, conflicts: [{ path: "a.c", ours: "ours", theirs: "theirs" }] });
    assert.deepEqual(stats.writes, []);
    assert.equal(syncedHashOf(ws, "a.c"), null);
  }
});

test("rule: ledger differs from both sides → conflict, never written, tiebreak not consulted", async () => {
  const ws = freshWs();
  const { provider, stats } = await seeded({ "a.c": "theirs" });
  recordSyncedHash(ws, "a.c", await sha16("base"));
  const report = await reconcileOnAttach({
    workspaceId: ws, provider, desired: [{ path: "a.c", content: "ours" }],
    tiebreak: () => assert.fail("a known ledger never falls to the tiebreak"),
  });
  assert.deepEqual(report, { ...none, conflicts: [{ path: "a.c", ours: "ours", theirs: "theirs" }] });
  assert.deepEqual(stats.writes, []);
  assert.equal(syncedHashOf(ws, "a.c"), await sha16("base"));
});

test("files only in the sandbox are never touched (shell-created files survive)", async () => {
  const { provider, stats } = await seeded({ "notes.txt": "mine", "build/out.o": "obj" });
  const report = await reconcileOnAttach({ workspaceId: freshWs(), provider, desired: [{ path: "a.c", content: "x" }] });
  assert.deepEqual(report, { ...none, written: ["a.c"] });
  assert.deepEqual(stats.writes, ["a.c"]);
  assert.equal(await readText(provider, "notes.txt"), "mine");
  assert.equal(await readText(provider, "build/out.o"), "obj");
});

test("caps: ours or theirs over the byte cap → skipped with the oversize reason; a file past the 500th is reconciled", async () => {
  const huge = "y".repeat(MAX_ATTACH_FILE_BYTES + 1);
  const { provider } = await seeded({ "huge-theirs.c": huge });
  const small = Array.from({ length: ATTACH_PAGE_FILES - 2 }, (_, i) => ({ path: `f/${i}.c`, content: `${i}` }));
  const desired = [{ path: "big.c", content: `${huge}x` }, { path: "huge-theirs.c", content: "ours" }, ...small, { path: "over.c", content: "1" }];
  const report = await reconcileOnAttach({ workspaceId: freshWs(), provider, desired, tiebreak: () => "ours" });
  const reasons = new Map(report.skipped.map((s) => [s.path, s.reason]));
  assert.equal(report.skipped.length, 2);
  assert.equal(reasons.get("big.c"), OVERSIZE_REASON);
  assert.equal(reasons.get("huge-theirs.c"), `sandbox copy ${OVERSIZE_REASON}`);
  assert.equal(report.written.length, ATTACH_PAGE_FILES - 1, "every small file, the 501st included");
  assert.deepEqual([await readText(provider, "big.c"), await readText(provider, "over.c")], [null, "1"]);
  assert.equal(await readText(provider, "huge-theirs.c"), huge);
});

// The attach stopped at the 500th file, and a session that kept those bodies loaded never
// reached the rest (146 minitalk and 2 gnl files on the demo workspace, 2026-10-14).
test("1001 files reconcile in pages: one hashes call per 500 paths, none skipped", async () => {
  const files = Object.fromEntries(Array.from({ length: 2 * ATTACH_PAGE_FILES + 1 }, (_, i) => [`src/f${i}.c`, `int f${i};\n`]));
  const { provider, reads } = await readLogged(files);
  const known = new Map(await Promise.all(Object.entries(files).map(async ([path, text]) => [path, await sha16(text)] as [string, string])));
  const asked: number[] = [];
  const desired = Object.entries(files).map(([path, content]) => ({ path, content }));
  const report = await reconcileOnAttach({
    workspaceId: freshWs(), provider, desired, theirsHashes: async (paths) => { asked.push(paths.length); return known; },
  });
  assert.deepEqual(asked, [ATTACH_PAGE_FILES, ATTACH_PAGE_FILES, 1]);
  assert.equal(reads.length, 0);
  assert.equal(report.recorded.length, 2 * ATTACH_PAGE_FILES + 1);
  assert.deepEqual(report.skipped, []);
});

test("one failing file never aborts the rest; a failed write leaves no ledger claim behind", async () => {
  const ws = freshWs();
  const { provider } = await seeded({ "bad-write.c": "old" }, { failRead: ["bad-read.c"], failWrite: ["bad-write.c", "bad-new.c"] });
  recordSyncedHash(ws, "bad-write.c", await sha16("old"));
  const paths = ["a.c", "bad-read.c", "bad-write.c", "bad-new.c", "z.c"];
  const report = await reconcileOnAttach({ workspaceId: ws, provider, desired: paths.map((path) => ({ path, content: "new" })) });
  assert.deepEqual([...report.written].sort(), ["a.c", "z.c"]);
  const reasons = new Map(report.skipped.map((s) => [s.path, s.reason]));
  assert.match(reasons.get("bad-read.c") ?? "", /injected read failure/);
  assert.match(reasons.get("bad-write.c") ?? "", /injected write failure/);
  assert.match(reasons.get("bad-new.c") ?? "", /injected write failure/);
  // Rolled back: a ledger claiming "new" would make the stale "old" look like a shell edit next attach.
  assert.equal(syncedHashOf(ws, "bad-write.c"), await sha16("old"));
  assert.equal(syncedHashOf(ws, "bad-new.c"), null);
});

test("bounded concurrency: in-flight provider calls never exceed maxConcurrent (default 8)", async () => {
  for (const maxConcurrent of [3, undefined]) {
    const { provider, stats } = instrumented({ delayMs: 5 });
    const desired = Array.from({ length: 20 }, (_, i) => ({ path: `f${i}.c`, content: `${i}` }));
    const report = await reconcileOnAttach({ workspaceId: freshWs(), provider, desired, maxConcurrent });
    assert.equal(report.written.length, 20);
    assert.ok(stats.maxInFlight <= (maxConcurrent ?? 8), `in flight ${stats.maxInFlight} > ${maxConcurrent ?? 8}`);
    assert.ok(stats.maxInFlight > 1, "files are reconciled concurrently, not serially");
  }
});

test("idempotent: written files are recorded, so a re-run writes nothing", async () => {
  const ws = freshWs();
  const { provider, stats } = await seeded({ "b.c": "old", "c.c": "same" });
  recordSyncedHash(ws, "b.c", await sha16("old"));
  const desired = [{ path: "src/a.c", content: "a" }, { path: "b.c", content: "new" }, { path: "c.c", content: "same" }];
  const first = await reconcileOnAttach({ workspaceId: ws, provider, desired });
  assert.deepEqual([...first.written].sort(), ["b.c", "src/a.c"]);
  stats.writes.length = 0;
  const second = await reconcileOnAttach({ workspaceId: ws, provider, desired });
  assert.deepEqual({ ...second, recorded: [...second.recorded].sort() }, { ...none, recorded: ["b.c", "c.c", "src/a.c"] });
  assert.deepEqual(stats.writes, []);
});

test("invalid and duplicate paths are skipped, never written", async () => {
  const { provider } = instrumented();
  const desired = [{ path: "../escape.c", content: "x" }, { path: "a//b.c", content: "x" }, { path: "ok.c", content: "first" }, { path: "ok.c", content: "second" }];
  const report = await reconcileOnAttach({ workspaceId: freshWs(), provider, desired });
  assert.deepEqual(report.written, ["ok.c"]);
  assert.deepEqual(report.skipped.map((s) => s.path).sort(), ["../escape.c", "a//b.c", "ok.c"]);
  assert.equal(await readText(provider, "ok.c"), "first");
});

test("a sandbox copy that is not UTF-8 text is skipped, never overwritten", async () => {
  const { provider } = await seeded({ "bin.c": new Uint8Array([0xff, 0xfe, 0x00]) });
  const report = await reconcileOnAttach({ workspaceId: freshWs(), provider, desired: [{ path: "bin.c", content: "text" }], tiebreak: () => "ours" });
  assert.match(report.skipped[0]?.reason ?? "", /UTF-8/);
  assert.deepEqual(await readBytes(provider, "bin.c"), [0xff, 0xfe, 0x00]);
});

test("the injected hash drives every comparison and the recorded ledger", async () => {
  const ws = freshWs();
  const { provider } = await seeded({ "a.c": "v1" });
  recordSyncedHash(ws, "a.c", "H:v1");
  const report = await reconcileOnAttach({ workspaceId: ws, provider, desired: [{ path: "a.c", content: "v2" }], hash: async (s) => `H:${s}` });
  assert.deepEqual(report.written, ["a.c"]);
  assert.equal(syncedHashOf(ws, "a.c"), "H:v2");
});

/** A provider whose reads are logged by path, over a sandbox seeded with `files`. */
async function readLogged(files: Record<string, string>) {
  const { provider, stats } = await seeded(files);
  const reads: string[] = [];
  const logged: FsProvider = { ...provider, read: (path, opts) => { reads.push(path.segments.join("/")); return provider.read(path, opts); } };
  return { provider: logged, stats, reads };
}

test("theirsHashes: an unchanged or absent file is decided without a read; a differing or unlisted one is read", async () => {
  const ws = freshWs();
  const { provider, stats, reads } = await readLogged({ "same.c": "same", "moved.c": "theirs", "unlisted.c": "u" });
  const known = new Map<string, string | null>([["same.c", await sha16("same")], ["moved.c", await sha16("theirs")], ["new.c", null]]);
  const asked: string[][] = [];
  const report = await reconcileOnAttach({
    workspaceId: ws, provider,
    desired: [{ path: "same.c", content: "same" }, { path: "moved.c", content: "ours" }, { path: "unlisted.c", content: "u" }, { path: "new.c", content: "n" }],
    theirsHashes: async (paths) => { asked.push([...paths]); return known; },
  });
  assert.deepEqual(asked, [["same.c", "moved.c", "unlisted.c", "new.c"]], "one call for every desired path");
  assert.deepEqual(reads.sort(), ["moved.c", "unlisted.c"]);
  assert.deepEqual({ ...report, recorded: report.recorded.sort() },
    { ...none, written: ["new.c"], recorded: ["same.c", "unlisted.c"], conflicts: [{ path: "moved.c", ours: "ours", theirs: "theirs" }] });
  assert.equal(stats.writes.length, 1);
});

test("theirsHashes: 500 unchanged files reconcile with one hashes call and no read", async () => {
  const files = Object.fromEntries(Array.from({ length: ATTACH_PAGE_FILES }, (_, i) => [`src/f${i}.c`, `int f${i};\n`]));
  const { provider, reads } = await readLogged(files);
  const known = new Map(await Promise.all(Object.entries(files).map(async ([path, text]) => [path, await sha16(text)] as [string, string])));
  let calls = 0;
  const desired = Object.entries(files).map(([path, content]) => ({ path, content }));
  const report = await reconcileOnAttach({ workspaceId: freshWs(), provider, desired, theirsHashes: async () => { calls += 1; return known; } });
  assert.equal(calls, 1);
  assert.equal(reads.length, 0);
  assert.equal(report.recorded.length, ATTACH_PAGE_FILES);
});

test("theirsHashes: a rejected call falls back to reading every file, same report", async () => {
  const ws = freshWs();
  const { provider, reads } = await readLogged({ "a.c": "a" });
  const report = await reconcileOnAttach({
    workspaceId: ws, provider, desired: [{ path: "a.c", content: "a" }, { path: "b.c", content: "b" }],
    theirsHashes: () => Promise.reject(new Error("bridge 429")),
  });
  assert.deepEqual(reads.sort(), ["a.c", "b.c"]);
  assert.deepEqual(report, { ...none, written: ["b.c"], recorded: ["a.c"] });
});
