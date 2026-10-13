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

import { reconcileOnAttach, MAX_ATTACH_FILES, MAX_ATTACH_FILE_BYTES } from "../../src/features/ide/model/reconcileOnAttach.ts";
import { recordSyncedHash, syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { sha16, isEchoHash } from "../../src/features/ide/model/ideFsEcho.ts";
import { instrumented, readBytes, readText, seeded } from "./ide-attach-fixtures.ts";

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

test("caps: past the file cap, ours over the byte cap, theirs over the byte cap → skipped with a reason", async () => {
  const huge = "y".repeat(MAX_ATTACH_FILE_BYTES + 1);
  const { provider } = await seeded({ "huge-theirs.c": huge });
  const small = Array.from({ length: MAX_ATTACH_FILES - 2 }, (_, i) => ({ path: `f/${i}.c`, content: `${i}` }));
  const desired = [{ path: "big.c", content: `${huge}x` }, { path: "huge-theirs.c", content: "ours" }, ...small, { path: "over.c", content: "1" }];
  const report = await reconcileOnAttach({ workspaceId: freshWs(), provider, desired, tiebreak: () => "ours" });
  const reasons = new Map(report.skipped.map((s) => [s.path, s.reason]));
  assert.equal(report.skipped.length, 3);
  assert.match(reasons.get("big.c") ?? "", /512 KiB/);
  assert.match(reasons.get("huge-theirs.c") ?? "", /sandbox copy .*512 KiB/);
  assert.match(reasons.get("over.c") ?? "", /500-file/);
  assert.equal(report.written.length, MAX_ATTACH_FILES - 2);
  assert.deepEqual([await readText(provider, "big.c"), await readText(provider, "over.c")], [null, null]);
  assert.equal(await readText(provider, "huge-theirs.c"), huge);
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
