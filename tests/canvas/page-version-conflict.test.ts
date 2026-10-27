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

// The 409 path: merge, re-send (bounded by MAX_REBASES), and — when the merge cannot
// be done or the bound runs out — the loss-safe copy path.
//
// C25: with no base (a reload kept the version but not the content it belongs to) the
// merge refuses to guess: the server's copy stands and the local edit goes to a copy.
// C28: a server that always refuses the version gets exactly 1 + MAX_REBASES PATCHes for
// that page, then the copy path — and the other pages of the batch are still published.
// C29: a keepalive the server refuses leaves the page pending, and the next load's
// replay does not overwrite the server's copy.
// Plus the two-client case: A and B edit one page concurrently, and after both flushes
// the server holds BOTH edits.
// Plus the read-only rule: a REFUSAL closes the page for the session, a CONFLICT copy
// does not — the server never said the reader may not write it.

import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "@osionos/http-gate";
import type { Block } from "@/entities/block";
import type { PageEntry } from "@/entities/page";
import { canWritePage, getCurrentPageAccessContext } from "@/shared/lib/auth/pageAccess";
import { publishPage, publishPageKeepalive, type OutboxDeps } from "@/store/sync/pageOutbox";
import { clearBase, setBase } from "@/store/sync/pageBase";
import { MAX_REBASES } from "@/store/sync/pageConflict";
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
    recordVersion: () => undefined,
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

/**
 * The live access context the flush marks: a session on the user-store seam the page
 * access layer reads. The session object stays the SAME one across the reads — the
 * context is memoized on it, so a fresh object per read would lose every mark.
 */
function installSession(userId = "owner"): void {
  const session = {
    userId,
    accessToken: "tok",
    refreshToken: "rtok",
    privateWorkspaces: [{ _id: "ws" }],
    sharedWorkspaces: [],
  };
  Reflect.set(globalThis, "__playgroundUserStore", {
    getState: () => ({ activeSession: () => session }),
    subscribe: () => () => undefined,
  });
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

test("C28: a server that always refuses the version gets 1 + MAX_REBASES PATCHes, the copy path, and the batch goes on", async () => {
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
  // The write, then MAX_REBASES re-sends — bounded, never a loop.
  const p1Patches = bridge.patches.filter((patch) => patch.pageId === "p1");
  assert.equal(p1Patches.length, 1 + MAX_REBASES);
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
  assert.equal(p1Patches.length, 3, "A's write, B's refused write, and one re-send");
  assert.equal(p1Patches[1].body.baseVersion, 1, "B's write was pinned to the version B had read");
  assert.equal(p1Patches[2].body.baseVersion, 2, "the re-send is pinned to the version the 409 carried");
  // The server holds BOTH edits.
  const texts = (bridge.pages.get("p1")?.content ?? []).map((block) => block.content);
  assert.ok(texts.includes("A's edit"), "A's edit is gone");
  assert.ok(texts.includes("B's block"), "B's block is gone");
  clearBase("p1");
});

test("three writers on one page: a re-send that meets another 409 merges again — no copy, every edit kept", async () => {
  const base = [para("b1", "one"), para("b2", "two"), para("b3", "three")];
  const bridge = createBridge({ p1: { version: 1, content: base } });
  // A and B each land just before one of C's writes: C's write AND its first re-send are 409s.
  bridge.racers.set("p1", [
    [para("b1", "A's edit"), para("b2", "two"), para("b3", "three")],
    [para("b1", "A's edit"), para("b2", "B's edit"), para("b3", "three")],
  ]);
  const recovery = fakeRecovery(pageEntry("p1", base), pageEntry("c1", []));
  const { deps } = flushDepsFor(bridge, recovery);
  setBase("p1", 1, base);
  const c = pageEntry("p1", [para("b1", "one"), para("b2", "two"), para("b3", "C's edit")]);
  const step = await publishOutboxPage(job(c, "p1"), deps);
  assert.equal(step, "continue");
  assert.equal(bridge.patches.length, 3, "the write, then two re-sends");
  assert.ok(!recovery.calls.some(([name]) => name === "createCopy"), "the edit left the page for a copy");
  const texts = (bridge.pages.get("p1")?.content ?? []).map((block) => block.content);
  assert.deepEqual(texts, ["A's edit", "B's edit", "C's edit"]);
  clearBase("p1");
});

test("a conflict merges the store's latest copy: text typed during the round-trip is not overwritten", async () => {
  const bridge = createBridge({ p1: { version: 2, content: [para("b1", "theirs"), para("b2", "two")] } });
  const { deps, applied } = flushDepsFor(bridge);
  // The reader kept typing in b2 while the stale write was in flight.
  deps.latest = () => pageEntry("p1", [para("b1", "base"), para("b2", "two, and more")]);
  setBase("p1", 1, [para("b1", "base"), para("b2", "two")]);
  const sent = pageEntry("p1", [para("b1", "base"), para("b2", "two, and")]);
  const step = await publishOutboxPage(job(sent, "p1"), deps);
  assert.equal(step, "continue");
  const texts = (bridge.pages.get("p1")?.content ?? []).map((block) => block.content);
  assert.deepEqual(texts, ["theirs", "two, and more"]);
  assert.deepEqual(applied.at(-1)?.map((block) => block.content), ["theirs", "two, and more"]);
  clearBase("p1");
});

test("past the bound, the copy holds the store's latest copy, not the last round's", async () => {
  const bridge = createBridge({ p1: { version: 9, content: [para("b1", "theirs")] } });
  bridge.refuses.add("p1");
  const recovery = fakeRecovery(pageEntry("p1", [para("b1", "theirs")]), pageEntry("c1", []));
  const { deps } = flushDepsFor(bridge, recovery);
  let rounds = 0;
  // The reader keeps typing: each round the store holds one more word.
  deps.latest = () => pageEntry("p1", [para("b1", `mine ${"+".repeat(rounds++)}`)]);
  setBase("p1", 4, [para("b1", "base")]);
  await publishOutboxPage(job(pageEntry("p1", [para("b1", "mine")]), "p1"), deps);
  const copy = recovery.calls.find(([name]) => name === "createCopy")?.[1] as { content: Block[] };
  const last = `mine ${"+".repeat(rounds - 1)}`;
  assert.ok(copy.content.some((block) => String(block.content).includes(last)), "the copy lost the latest typing");
  clearBase("p1");
});

test("a store that refuses the merged content stops the conflict: nothing unmerged is re-sent", async () => {
  const bridge = createBridge({ p1: { version: 2, content: [para("b1", "theirs")] } });
  const { deps } = flushDepsFor(bridge);
  const sent = pageEntry("p1", [para("b1", "base"), para("b2", "mine")]);
  // updatePageContent is a no-op for a reader who lost write access: the store keeps its copy.
  deps.applyContent = () => sent;
  setBase("p1", 1, [para("b1", "base")]);
  const step = await publishOutboxPage(job(sent, "p1"), deps);
  assert.equal(step, "stop", "the page stays pending");
  assert.equal(bridge.patches.length, 1, "only the first write: no unmerged re-send");
  assert.deepEqual(bridge.pages.get("p1")?.content, [para("b1", "theirs")]);
  clearBase("p1");
});

test("a conflict copy keeps the page writable: a 409 is not a refusal", async () => {
  installSession();
  const bridge = createBridge({ p1: { version: 9, content: [para("b1", "theirs")] } });
  bridge.refuses.add("p1"); // the server answers 409 to every write
  const recovery = fakeRecovery(pageEntry("p1", [para("b1", "theirs")]), pageEntry("c1", []));
  const { deps } = flushDepsFor(bridge, recovery);
  setBase("p1", 4, [para("b1", "base")]);
  const page = pageEntry("p1", [para("b1", "mine")]);
  const step = await publishOutboxPage(job(page, "p1"), deps);
  assert.equal(step, "continue");
  // The local edit is safe: it went to a copy.
  const copy = recovery.calls.find(([name]) => name === "createCopy")?.[1] as { content: Block[] };
  const copyTexts = copy.content.map((block) => block.content);
  assert.ok(copyTexts.includes("mine"), "the copy does not hold the local edit");
  // The page is still writable: the server never refused this reader.
  const context = getCurrentPageAccessContext();
  assert.ok(context, "no access context");
  assert.equal(context.refusedPageIds?.has("p1"), false, "a conflict must not refuse the page");
  assert.equal(canWritePage(page, context, "update"), true, "the page went read-only for nothing");
  clearBase("p1");
});

test("a refusal still closes the page: a 403 on the PATCH marks it refused", async () => {
  installSession();
  const forbidden: OutboxDeps = {
    token: () => "jwt",
    base: () => "http://bridge.test",
    patch: async () => { throw new ApiError("You may not write this page.", 403, "FORBIDDEN"); },
    keepalive: () => undefined,
  };
  const recovery = fakeRecovery(pageEntry("p1", []), pageEntry("c1", []));
  const { deps } = flushDepsFor(createBridge({ p1: { version: 1, content: [] } }), recovery);
  deps.publish = (page) => publishPage(page, forbidden);
  const page = pageEntry("p1", [para("b1", "mine")]);
  const step = await publishOutboxPage(job(page, "p1"), deps);
  assert.equal(step, "continue");
  // The server's verdict is "you may not write": the page is read-only for the session.
  const context = getCurrentPageAccessContext();
  assert.ok(context, "no access context");
  assert.equal(context.refusedPageIds?.has("p1"), true, "a refusal must mark the page");
  assert.equal(canWritePage(page, context, "update"), false, "a refused page stays read-only");
});
