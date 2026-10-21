/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-version-conflict.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The 409 path: merge, re-send ONCE, and — when the merge cannot be done — the
// loss-safe copy path.
//
// C25: with no base (a reload kept the version but not the content it belongs to) the
// merge refuses to guess: the server's copy stands and the local edit goes to a copy.
// C28: a server that always refuses the version gets exactly TWO PATCHes for that page,
// then the copy path — and the other pages of the batch are still published.
// C29: a keepalive the server refuses leaves the page pending, and the next load's
// replay does not overwrite the server's copy.
// Plus the two-client case: A and B edit one page concurrently, and after both flushes
// the server holds BOTH edits.

import assert from "node:assert/strict";
import test from "node:test";

import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import { publishPage, publishPageKeepalive } from "@/store/sync/pageOutbox";
import { clearBase, setBase } from "@/store/sync/pageBase";
import { publishOutboxPage, type FlushDeps } from "@/store/sync/pageFlush";
import { keepPendingPages, withPendingPages } from "@/store/sync/pendingPages";
import type { FakeBridge } from "./page-version.fixtures";
import { bridgeDeps, createBridge, fakeRecovery, pageEntry, para } from "./page-version.fixtures";

/** A localStorage stub: the pending pages live there. */
let store = new Map<string, string>();
const storage = {
  get length() { return store.size; },
  key: (index: number) => [...store.keys()][index] ?? null,
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
};

/** The flush, driven by the fake bridge. */
function flushDepsFor(bridge: FakeBridge, recovery = fakeRecovery(pageEntry("copy", []), pageEntry("copy", []))) {
  const notices: Array<{ kind: string; title: string; description: string }> = [];
  const applied: Block[][] = [];
  const deps: FlushDeps = {
    publish: (page) => publishPage(page, bridgeDeps(bridge)),
    recovery: recovery.deps,
    privateWorkspaceId: () => "private",
    notify: (notice) => { notices.push(notice); },
    applyContent: (_pageId, content) => { applied.push(content); return null; },
  };
  return { deps, notices, applied, recovery };
}

/** One page's turn in the flush. */
function job(page: PageEntry, id: string) {
  return {
    page,
    id,
    stamp: `stamp-${id}`,
    confirmed: {} as Record<string, string>,
    forgotten: new Set<string>(),
    budget: { left: 5 },
  };
}

test("C19: the conflict's version reaches the merge, and the re-send is pinned to it", async () => {
  const bridge = createBridge({ p1: { version: 9, content: [para("b1", "theirs")] } });
  const { deps, applied } = flushDepsFor(bridge);
  const page = pageEntry("p1", [para("b1", "mine")]);
  setBase("p1", 8, [para("b1", "base")]);
  const step = await publishOutboxPage(job(page, "p1"), deps);
  assert.equal(step, "continue");
  assert.equal(bridge.patches.length, 2, "the write, then the one re-send");
  assert.equal(bridge.patches[0].body.baseVersion, 8, "the write was pinned to the base");
  assert.equal(bridge.patches[1].body.baseVersion, 9, "the re-send is pinned to the version the 409 carried");
  // The merge kept both sides: the local edit and the server's block.
  assert.equal(applied.length, 1, "the merged content went into the store");
  const texts = applied[0].map((block) => block.content);
  assert.ok(texts.includes("mine"), "the local edit is lost");
  assert.ok(texts.includes("theirs"), "the server's block is lost");
  clearBase("p1");
});

test("C25: with no base the merge refuses to guess — the server's copy stands, the edit goes to a copy", async () => {
  const bridge = createBridge({ p1: { version: 9, content: [para("b1", "theirs")] } });
  const server = pageEntry("p1", [para("b1", "theirs")]);
  const recovery = fakeRecovery(server, pageEntry("c1", [], { title: "Plan (copy)" }));
  const { deps } = flushDepsFor(bridge, recovery);
  // A RELOAD: the pending record kept the version the edit was made against, but the
  // base content only ever lived in memory.
  clearBase("p1");
  const page = pageEntry("p1", [para("b1", "mine")], { contentVersion: 4 });
  const step = await publishOutboxPage(job(page, "p1"), deps);
  assert.equal(step, "continue");
  // The server's copy is untouched.
  assert.deepEqual(bridge.pages.get("p1")?.content, [para("b1", "theirs")]);
  // The copy path ran: the local edit became a copy, the original went back to the server's.
  assert.deepEqual(recovery.calls.map(([name]) => name), [
    "fetchServerPage",
    "createCopy",
    "replaceLocalPage",
    "notify",
  ]);
  const copy = recovery.calls.find(([name]) => name === "createCopy")?.[1] as { content: Block[] };
  assert.deepEqual(copy.content, [para("b1", "mine")], "the copy holds the local edit");
  // The notice says where the edit went.
  const notice = recovery.calls.find(([name]) => name === "notify")?.[1] as { title: string; description: string };
  assert.match(notice.description, /Plan \(copy\)/);
  assert.match(notice.description, /private workspace/);
});

test("C28: a server that always refuses the version gets two PATCHes, the copy path, and the batch goes on", async () => {
  const bridge = createBridge({
    p1: { version: 9, content: [para("b1", "theirs")] },
    p2: { version: 3, content: [para("b2", "other")] },
  });
  bridge.refuses.add("p1");
  const recovery = fakeRecovery(pageEntry("p1", [para("b1", "theirs")]), pageEntry("c1", []));
  const { deps } = flushDepsFor(bridge, recovery);
  // The client saw p1 at version 4 and p2 at version 3.
  setBase("p1", 4, [para("b1", "base")]);
  setBase("p2", 3, [para("b2", "other")]);
  const first = job(pageEntry("p1", [para("b1", "mine")]), "p1");
  const second = job(pageEntry("p2", [para("b2", "edited")]), "p2");
  const step1 = await publishOutboxPage(first, deps);
  assert.equal(step1, "continue", "a conflict does not stop the batch");
  const step2 = await publishOutboxPage(second, deps);
  assert.equal(step2, "continue");
  // Exactly two PATCHes for the refused page: the write and the one re-send.
  const p1Patches = bridge.patches.filter((patch) => patch.pageId === "p1");
  assert.equal(p1Patches.length, 2);
  // The copy path ran — the local edit is safe.
  assert.ok(recovery.calls.some(([name]) => name === "createCopy"), "the copy path did not run");
  // The other page of the batch was published.
  assert.deepEqual(bridge.pages.get("p2")?.content, [para("b2", "edited")]);
  assert.equal(bridge.pages.get("p2")?.version, 4, "its version moved with its content");
  clearBase("p1");
  clearBase("p2");
});

test("C29: a keepalive the server refuses leaves the page pending, and the replay does not overwrite the server's copy", async () => {
  store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  const bridge = createBridge({ p1: { version: 9, content: [para("b1", "theirs")] } });
  const deps = bridgeDeps(bridge);
  const page = pageEntry("p1", [para("b1", "mine")], { contentVersion: 4 });
  setBase("p1", 4, [para("b1", "base")]);
  publishPageKeepalive(page, deps);
  assert.equal(bridge.keepalives.length, 1);
  assert.equal(bridge.keepalives[0].body.baseVersion, 4, "the keepalive carries the version too");
  assert.equal(bridge.keepalives[0].status, 409, "the server refused it: the copy moved on");
  // The edit is still pending, and the record carries the version it was made against.
  keepPendingPages([page], storage);
  const restored = withPendingPages({}, storage).ws?.[0] as PageEntry | undefined;
  assert.equal(restored?._id, "p1", "the pending page survived the refused keepalive");
  assert.equal(restored?.contentVersion, 4);
  // The next load: the base content is gone (it only lived in memory).
  clearBase("p1");
  const recovery = fakeRecovery(pageEntry("p1", [para("b1", "theirs")]), pageEntry("c1", []));
  const { deps: flushDeps } = flushDepsFor(bridge, recovery);
  const step = await publishOutboxPage(job(restored as PageEntry, "p1"), flushDeps);
  assert.equal(step, "continue");
  // The server's copy is untouched: the replay went to a copy, not over the top of it.
  assert.deepEqual(bridge.pages.get("p1")?.content, [para("b1", "theirs")]);
  assert.ok(recovery.calls.some(([name]) => name === "createCopy"), "the edit did not go to a copy");
});

test("two clients editing one page: after both flushes the server holds both edits", async () => {
  const bridge = createBridge({ p1: { version: 1, content: [para("b1", "base")] } });
  const deps = bridgeDeps(bridge);
  const { deps: flushDeps } = flushDepsFor(bridge);
  // Client A read the page at version 1 and edited the first block.
  setBase("p1", 1, [para("b1", "base")]);
  const a = pageEntry("p1", [para("b1", "A's edit")]);
  const aOutcome = await publishPage(a, deps);
  assert.equal(aOutcome.result, "ok", "A's write landed");
  assert.equal(bridge.pages.get("p1")?.version, 2);
  // Client B read the page at version 1 too — it is stale — and added a block.
  setBase("p1", 1, [para("b1", "base")]);
  const b = pageEntry("p1", [para("b1", "base"), para("b2", "B's block")]);
  const step = await publishOutboxPage(job(b, "p1"), flushDeps);
  assert.equal(step, "continue");
  // The re-send is pinned to the version the 409 carried.
  const p1Patches = bridge.patches.filter((patch) => patch.pageId === "p1");
  assert.equal(p1Patches.length, 3, "A's write, B's refused write, and the one re-send");
  assert.equal(p1Patches[1].body.baseVersion, 1, "B's write was pinned to the version B had read");
  assert.equal(p1Patches[2].body.baseVersion, 2, "the re-send is pinned to the version the 409 carried");
  // The server holds BOTH edits.
  const texts = (bridge.pages.get("p1")?.content ?? []).map((block) => block.content);
  assert.ok(texts.includes("A's edit"), "A's edit is gone");
  assert.ok(texts.includes("B's block"), "B's block is gone");
  clearBase("p1");
});
