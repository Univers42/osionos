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

import { markShellArchived, recordSyncedHash, syncedHashOf } from "../../src/features/ide/model/ideSyncEngine.ts";
import { sha16 } from "../../src/features/ide/model/ideFsEcho.ts";
import { pageToFile } from "../../src/features/page-file/model/pageFileCodec.ts";
import { pageFileText } from "../../src/features/page-file/model/pageFileText.ts";
import { planOutbound } from "../../src/features/page-file/model/outboundPlan.ts";
import { LEFT_WITHOUT_PAGE, runOutbound } from "../../src/features/page-file/model/outboundRun.ts";
import { page } from "./page-tree-fixtures.ts";
import { block, cp, ctxFor, freshWs, snap, world } from "./page-file-writer-fixtures.ts";

test("write phase: hash already synced → skipped, nothing written", async () => {
  const ws = freshWs();
  const a = cp("pA", "One", null, "page", [block("v1")]);
  const w = world({ "One.omd": pageFileText(a) });
  recordSyncedHash(ws, "One.omd", await sha16(pageFileText(a)));
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [], changed: ["pA"], enteredCode: [] }, [a], w.io));
  assert.equal(w.files.get("One.omd"), pageFileText(a));
  assert.deepEqual(run.report.skipped, [{ path: "One.omd", reason: "already synced" }]);
  assert.deepEqual(run.report.written, []);
});
test("remove phase: shell edit since the last sync → kept, never removed", async () => {
  const ws = freshWs();
  const archived = page("pA", "One", null);
  recordSyncedHash(ws, "One.omd", await sha16("v1"));
  const w = world({ "One.omd": "changed in the shell" });
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [{ id: "pA", path: "One.omd" }], changed: [], enteredCode: [] }, [archived], w.io));
  assert.deepEqual(w.removals, []);
  assert.deepEqual(run.report.kept, [{ path: "One.omd", reason: "changed in the shell since the last sync" }]);
});
test("remove phase: file already gone → ledger cleared, no io", async () => {
  const ws = freshWs();
  const archived = page("pA", "One", null);
  recordSyncedHash(ws, "One.omd", "H:stale");
  const w = world();
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [{ id: "pA", path: "One.omd" }], changed: [], enteredCode: [] }, [archived], w.io));
  assert.equal(syncedHashOf(ws, "One.omd"), null);
  assert.deepEqual([...w.removals, ...run.report.removed, ...run.report.kept, ...run.report.failed], []);
});
test("a failed rename self-heals a file move: page text written at the free target", async () => {
  const ws = freshWs();
  const a = cp("pA", "One", null, "page", [block("v1")]);
  const w = world(); // the source is gone, so the rename fails
  const run = await runOutbound(ctxFor(ws, { moves: [{ id: "pA", from: "One.omd", to: "Two.omd", dir: false }], removes: [], changed: [], enteredCode: [] }, [a], w.io));
  assert.deepEqual(run.report.written, ["Two.omd"]);
  assert.equal(w.files.get("Two.omd"), pageFileText(a));
  assert.equal(syncedHashOf(ws, "Two.omd"), await sha16(pageFileText(a)));
});
test("a self-heal never clobbers an occupied target the ledger does not know", async () => {
  const ws = freshWs();
  const a = cp("pA", "One", null, "page", [block("v1")]);
  const w = world({ "One.omd": pageFileText(a), "Two.omd": "the other page, edited in the shell" });
  const run = await runOutbound(ctxFor(ws, { moves: [{ id: "pA", from: "One.omd", to: "Two.omd", dir: false }], removes: [], changed: [], enteredCode: [] }, [a], w.io));
  assert.equal(w.files.get("Two.omd"), "the other page, edited in the shell");
  assert.equal(w.files.get("One.omd"), pageFileText(a), "the old file is never removed");
  assert.deepEqual(run.report.kept, [{ path: "Two.omd", reason: "changed in the shell since the last sync" }]);
});
test("write phase: a file the shell changed since the last sync is kept, not overwritten", async () => {
  const ws = freshWs();
  const a = cp("pA", "One", null, "page", [block("app edit")]);
  recordSyncedHash(ws, "One.omd", await sha16("agreed"));
  const w = world({ "One.omd": "shell edit" });
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [], changed: ["pA"], enteredCode: [] }, [a], w.io));
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
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [], changed: ["pA", "pB"], enteredCode: [] }, [a, b], w.io));
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
  await runOutbound(ctxFor(ws, { moves: [{ id: "pA", from: "Road", to: "Lane", dir: true }], removes: [], changed: [], enteredCode: [] }, [a], w.io));
  assert.deepEqual([syncedHashOf(ws, "Lane/Q3.omd"), syncedHashOf(ws, "Lane/deep/x.ts"), syncedHashOf(ws, "Road/Q3.omd")], ["H:q3", "H:x", null]);
  assert.equal(syncedHashOf(ws, "Roadmap.omd"), "H:sibling", "a sibling sharing the prefix is not a child");
});
test("one failing write never stops the next; the failure leaves no ledger claim", async () => {
  const ws = freshWs();
  const pages = [cp("pA", "One", null, "page", [block("v1")]), cp("pB", "Two", null, "page", [block("v2")])];
  const w = world({}, ["One.omd"]);
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [], changed: ["pA", "pB"], enteredCode: [] }, pages, w.io));
  assert.deepEqual(run.report.written, ["Two.omd"]);
  assert.match(run.report.failed[0]?.reason ?? "", /injected write failure/);
  assert.equal(syncedHashOf(ws, "One.omd"), null);
  assert.equal(syncedHashOf(ws, "Two.omd"), await sha16(pageFileText(pages[1])));
});
test("a folder page is never deleted, even when archived", async () => {
  const ws = freshWs();
  const folder = page("pF", "Hub", null, "folder");
  const w = world();
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [{ id: "pF", path: "Hub" }], changed: [], enteredCode: [] }, [folder], w.io));
  assert.deepEqual([...w.removals, ...run.report.removed, ...run.report.failed, ...run.report.kept], []);
});
test("the synced ledger follows a successful rename to the new path", async () => {
  const ws = freshWs();
  const a = cp("pA", "One", null);
  const w = world({ "One.omd": "x" });
  recordSyncedHash(ws, "One.omd", "H:agreed");
  const run = await runOutbound(ctxFor(ws, { moves: [{ id: "pA", from: "One.omd", to: "Two.omd", dir: false }], removes: [], changed: [], enteredCode: [] }, [a], w.io));
  assert.deepEqual(run.report.moved, ["Two.omd"]);
  assert.equal(syncedHashOf(ws, "Two.omd"), "H:agreed");
  assert.equal(syncedHashOf(ws, "One.omd"), null);
});
// The inbound side records the agreed hash of a file it just made a page from. A remove
// planned before that, for the page archived at the same path, must not read the new
// agreement mid-run and delete the file (live VM, 2026-10-14: 231 cloned files lost).
test("remove phase: an agreement recorded during the run → kept, never removed", async () => {
  const ws = freshWs();
  const archived = page("pA", "One", null);
  const w = world({ "One.omd": "cloned again" });
  const read = w.io.read;
  w.io.read = async (path) => {
    recordSyncedHash(ws, path, await sha16("cloned again"));
    return read(path);
  };
  const run = await runOutbound(ctxFor(ws, { moves: [], removes: [{ id: "pA", path: "One.omd" }], changed: [], enteredCode: [] }, [archived], w.io));
  assert.deepEqual(w.removals, []);
  assert.equal(w.files.get("One.omd"), "cloned again");
  assert.deepEqual(run.report.removed, []);
});

// Devil R1: the agreement a remove clears is the one it planned with, never one a new
// page recorded at the same path while the read or the remove was in flight.
test("remove phase: the file is gone and a new page's agreement lands during the read → it stays", async () => {
  const ws = freshWs();
  const w = world({});
  const read = w.io.read;
  const fresh = await sha16("the new page");
  w.io.read = async (path) => {
    const text = await read(path);
    recordSyncedHash(ws, path, fresh);
    return text;
  };
  await runOutbound(ctxFor(ws, { moves: [], removes: [{ id: "gone", path: "x.c" }], changed: [], enteredCode: [] }, [], w.io));
  assert.equal(syncedHashOf(ws, "x.c"), fresh);
});

test("remove phase: a new page's agreement recorded while the file is being removed → it stays", async () => {
  const ws = freshWs();
  recordSyncedHash(ws, "One.omd", await sha16("v1"));
  const w = world({ "One.omd": "v1" });
  const remove = w.io.remove;
  const fresh = await sha16("the new page");
  w.io.remove = async (path) => {
    await remove(path);
    recordSyncedHash(ws, path, fresh);
  };
  await runOutbound(ctxFor(ws, { moves: [], removes: [{ id: "pA", path: "One.omd" }], changed: [], enteredCode: [] }, [page("pA", "One", null)], w.io));
  assert.deepEqual(w.removals, ["One.omd"]);
  assert.equal(syncedHashOf(ws, "One.omd"), fresh);
});

test("remove phase: a page the shell deleted is never removed by the writer — once; the next remove is judged again", async () => {
  const ws = freshWs();
  recordSyncedHash(ws, "One.omd", await sha16("v1"));
  markShellArchived(ws, ["pA"]);
  const w = world({ "One.omd": "v1" });
  const plan = { moves: [], removes: [{ id: "pA", path: "One.omd" }], changed: [], enteredCode: [] };
  const first = await runOutbound(ctxFor(ws, plan, [page("pA", "One", null)], w.io));
  assert.deepEqual(w.removals, []);
  assert.deepEqual(first.report.skipped, [{ path: "One.omd", reason: "deleted in the shell" }]);
  assert.equal(syncedHashOf(ws, "One.omd"), null, "the skipped page's agreement is forgotten with it");
  recordSyncedHash(ws, "One.omd", await sha16("v1"));
  await runOutbound(ctxFor(ws, plan, [page("pA", "One", null)], w.io));
  assert.deepEqual(w.removals, ["One.omd"]);
});

// devil F1, H1: a tab that did not remove the page itself (a follower, or a successor leader with
// none of the closed tab's marks) holds the agreement it hydrated at load. Its writer, seeing the
// archive at a refetch, must not read that as a match for what a `git clone` put back.
test("remove phase: a page this tab's user did not remove keeps its file and loses its agreement", async () => {
  const ws = freshWs();
  const w = world({ "One.omd": "v1" }); // another tab applied `rm One.omd`; `git clone` put v1 back
  const plan = { moves: [], removes: [{ id: "pA", path: "One.omd" }], changed: [], enteredCode: [] };
  recordSyncedHash(ws, "One.omd", await sha16("v1")); // what this tab hydrated at load
  const asked: string[] = [];
  const run = await runOutbound({
    ...ctxFor(ws, plan, [page("pA", "One", null)], w.io),
    mayRemove: (id) => { asked.push(id); return false; },
  });
  assert.deepEqual(asked, ["pA"]);
  assert.deepEqual(w.removals, []);
  assert.equal(w.files.get("One.omd"), "v1");
  assert.deepEqual(run.report.skipped, [{ path: "One.omd", reason: LEFT_WITHOUT_PAGE }]);
  assert.equal(syncedHashOf(ws, "One.omd"), null, "no later round can read the stale agreement as a match");
});

test("remove phase: the shell's mark wins over an app removal, and both are spent in that round", async () => {
  const ws = freshWs();
  recordSyncedHash(ws, "One.omd", await sha16("v1"));
  markShellArchived(ws, ["pA"]); // `rm One.omd`: the inbound archive records an app removal too
  const w = world({ "One.omd": "v1" });
  const plan = { moves: [], removes: [{ id: "pA", path: "One.omd" }], changed: [], enteredCode: [] };
  const intents = new Set(["pA"]);
  const mayRemove = (id: string): boolean => intents.delete(id);
  const run = await runOutbound({ ...ctxFor(ws, plan, [page("pA", "One", null)], w.io), mayRemove });
  assert.deepEqual(run.report.skipped, [{ path: "One.omd", reason: "deleted in the shell" }]);
  assert.deepEqual(intents, new Set(), "the intent did not outlive the round");
  recordSyncedHash(ws, "One.omd", await sha16("v1")); // the clone, agreed again
  const again = await runOutbound({ ...ctxFor(ws, plan, [page("pA", "One", null)], w.io), mayRemove });
  assert.deepEqual(w.removals, []);
  assert.deepEqual(again.report.skipped, [{ path: "One.omd", reason: LEFT_WITHOUT_PAGE }]);
});

test("enteredCode: a missing code file is remade and agreed; an existing file is left alone with no report", async () => {
  const ws = freshWs();
  const codeA = cp("pA", "a.c", null, "code", [{ id: "b-a", type: "code", content: "int a(){return 1;}" } as never]);
  const codeB = cp("pB", "b.c", null, "code", [{ id: "b-b", type: "code", content: "int b(){return 2;}" } as never]);
  const plan = planOutbound(snap(ws, []), snap(ws, [codeA, codeB]));
  recordSyncedHash(ws, "b.c", await sha16("shell bytes"));
  const w = world({ "b.c": "shell bytes" });
  const run = await runOutbound(ctxFor(ws, plan, [codeA, codeB], w.io));
  assert.equal(w.files.get("a.c"), pageToFile(codeA));
  assert.equal(syncedHashOf(ws, "a.c"), await sha16(pageToFile(codeA)));
  assert.equal(w.files.get("b.c"), "shell bytes");
  assert.deepEqual(run.report.written, ["a.c"]);
  const mentioned = [...run.report.written, ...run.report.skipped.map((s) => s.path), ...run.report.kept.map((k) => k.path), ...run.report.failed.map((f) => f.path), ...run.report.moved, ...run.report.removed];
  assert.equal(mentioned.includes("b.c"), false);
});
