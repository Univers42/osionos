/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-file-writer-run.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";

import { recordSyncedHash, syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { pageFileText } from "../../src/features/page-file/model/pageFileText.ts";
import { runOutbound } from "../../src/features/page-file/model/outboundRun.ts";
import { page } from "./page-tree-fixtures.ts";
import { block, cp, ctxFor, freshWs, world } from "./page-file-writer-fixtures.ts";

test("write phase: hash already synced → skipped, nothing written", async () => {
  const ws = freshWs();
  const a = cp("pA", "One", null, "page", [block("v1")]);
  const w = world({ "One.omd": pageFileText(a) });
  recordSyncedHash(ws, "One.omd", await sha16(pageFileText(a)));
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [], changed: ["pA"] }, [a], w.io));
  assert.equal(w.files.get("One.omd"), pageFileText(a));
  assert.deepEqual(run.report.skipped, [{ path: "One.omd", reason: "already synced" }]);
  assert.deepEqual(run.report.written, []);
});
test("remove phase: shell edit since the last sync → kept, never removed", async () => {
  const ws = freshWs();
  const archived = page("pA", "One", null);
  recordSyncedHash(ws, "One.omd", await sha16("v1"));
  const w = world({ "One.omd": "changed in the shell" });
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [{ id: "pA", path: "One.omd" }], changed: [] }, [archived], w.io));
  assert.deepEqual(w.removals, []);
  assert.deepEqual(run.report.kept, [{ path: "One.omd", reason: "changed in the shell since the last sync" }]);
});
test("remove phase: file already gone → ledger cleared, no io", async () => {
  const ws = freshWs();
  const archived = page("pA", "One", null);
  recordSyncedHash(ws, "One.omd", "H:stale");
  const w = world();
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [{ id: "pA", path: "One.omd" }], changed: [] }, [archived], w.io));
  assert.equal(syncedHashOf(ws, "One.omd"), null);
  assert.deepEqual([...w.removals, ...run.report.removed, ...run.report.kept, ...run.report.failed], []);
});
test("a failed rename self-heals a file move: page text written at the free target", async () => {
  const ws = freshWs();
  const a = cp("pA", "One", null, "page", [block("v1")]);
  const w = world(); // the source is gone, so the rename fails
  const run = await runOutbound(ctxFor(ws, { moves: [{ id: "pA", from: "One.omd", to: "Two.omd", dir: false }], removes: [], changed: [] }, [a], w.io));
  assert.deepEqual(run.report.written, ["Two.omd"]);
  assert.equal(w.files.get("Two.omd"), pageFileText(a));
  assert.equal(syncedHashOf(ws, "Two.omd"), await sha16(pageFileText(a)));
});
test("a self-heal never clobbers an occupied target the ledger does not know", async () => {
  const ws = freshWs();
  const a = cp("pA", "One", null, "page", [block("v1")]);
  const w = world({ "One.omd": pageFileText(a), "Two.omd": "the other page, edited in the shell" });
  const run = await runOutbound(ctxFor(ws, { moves: [{ id: "pA", from: "One.omd", to: "Two.omd", dir: false }], removes: [], changed: [] }, [a], w.io));
  assert.equal(w.files.get("Two.omd"), "the other page, edited in the shell");
  assert.equal(w.files.get("One.omd"), pageFileText(a), "the old file is never removed");
  assert.deepEqual(run.report.kept, [{ path: "Two.omd", reason: "changed in the shell since the last sync" }]);
});
test("write phase: a file the shell changed since the last sync is kept, not overwritten", async () => {
  const ws = freshWs();
  const a = cp("pA", "One", null, "page", [block("app edit")]);
  recordSyncedHash(ws, "One.omd", await sha16("agreed"));
  const w = world({ "One.omd": "shell edit" });
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [], changed: ["pA"] }, [a], w.io));
  assert.equal(w.files.get("One.omd"), "shell edit");
  assert.deepEqual(run.report.kept, [{ path: "One.omd", reason: "changed in the shell since the last sync" }]);
  assert.equal(syncedHashOf(ws, "One.omd"), await sha16("agreed"));
});
test("write phase: the agreed content is replaced; identical content only records the ledger", async () => {
  const ws = freshWs();
  const a = cp("pA", "One", null, "page", [block("v2")]);
  const b = cp("pB", "Two", null, "page", [block("same")]);
  recordSyncedHash(ws, "One.omd", await sha16("v1 agreed"));
  const w = world({ "One.omd": "v1 agreed", "Two.omd": pageFileText(b) });
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [], changed: ["pA", "pB"] }, [a, b], w.io));
  assert.equal(w.files.get("One.omd"), pageFileText(a));
  assert.deepEqual(run.report.written, ["One.omd"]);
  assert.equal(syncedHashOf(ws, "Two.omd"), await sha16(pageFileText(b)));
});
test("a dir rename carries every ledger key under it", async () => {
  const ws = freshWs();
  const a = cp("pA", "Road", null);
  recordSyncedHash(ws, "Road/Q3.omd", "H:q3");
  recordSyncedHash(ws, "Road/deep/x.ts", "H:x");
  recordSyncedHash(ws, "Roadmap.omd", "H:sibling");
  const w = world({ "Road/Q3.omd": "q3" });
  await runOutbound(ctxFor(ws, { moves: [{ id: "pA", from: "Road", to: "Lane", dir: true }], removes: [], changed: [] }, [a], w.io));
  assert.deepEqual([syncedHashOf(ws, "Lane/Q3.omd"), syncedHashOf(ws, "Lane/deep/x.ts"), syncedHashOf(ws, "Road/Q3.omd")], ["H:q3", "H:x", null]);
  assert.equal(syncedHashOf(ws, "Roadmap.omd"), "H:sibling", "a sibling sharing the prefix is not a child");
});
test("one failing write never stops the next; the failure leaves no ledger claim", async () => {
  const ws = freshWs();
  const pages = [cp("pA", "One", null, "page", [block("v1")]), cp("pB", "Two", null, "page", [block("v2")])];
  const w = world({}, ["One.omd"]);
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [], changed: ["pA", "pB"] }, pages, w.io));
  assert.deepEqual(run.report.written, ["Two.omd"]);
  assert.match(run.report.failed[0]?.reason ?? "", /injected write failure/);
  assert.equal(syncedHashOf(ws, "One.omd"), null);
  assert.equal(syncedHashOf(ws, "Two.omd"), await sha16(pageFileText(pages[1])));
});
test("a folder page is never deleted, even when archived", async () => {
  const ws = freshWs();
  const folder = page("pF", "Hub", null, "folder");
  const w = world();
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [{ id: "pF", path: "Hub" }], changed: [] }, [folder], w.io));
  assert.deepEqual([...w.removals, ...run.report.removed, ...run.report.failed, ...run.report.kept], []);
});
test("the synced ledger follows a successful rename to the new path", async () => {
  const ws = freshWs();
  const a = cp("pA", "One", null);
  const w = world({ "One.omd": "x" });
  recordSyncedHash(ws, "One.omd", "H:agreed");
  const run = await runOutbound(ctxFor(ws, { moves: [{ id: "pA", from: "One.omd", to: "Two.omd", dir: false }], removes: [], changed: [] }, [a], w.io));
  assert.deepEqual(run.report.moved, ["Two.omd"]);
  assert.equal(syncedHashOf(ws, "Two.omd"), "H:agreed");
  assert.equal(syncedHashOf(ws, "One.omd"), null);
});