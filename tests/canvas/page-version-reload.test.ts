/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   page-version-reload.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A reload must not turn the reader's OWN edits into a conflict. Release R6 (2026-10-22):
// one reader edited a page, reloaded, edited again — the PATCH went out under the version
// the page was LOADED at (the cached page's contentVersion; the 200s had only advanced the
// in-memory base), the bridge answered 409, and with no base content after the reload the
// edit went to a "(copy)" page while the original reverted.

import assert from "node:assert/strict";
import test from "node:test";

import type { PageEntry } from "@/entities/page";
import { mergePageContent } from "@/store/sync/mergePageContent";
import { clearBase, setBase } from "@/store/sync/pageBase";
import { publishOutboxPage, type FlushDeps } from "@/store/sync/pageFlush";
import { publishPage, publishPageKeepalive } from "@/store/sync/pageOutbox";
import type { FakeBridge } from "./page-version.fixtures";
import { bridgeDeps, createBridge, fakeRecovery, pageEntry, para } from "./page-version.fixtures";

/** The flush, driven by the fake bridge; the store is the one page the test holds. */
function flushDepsFor(bridge: FakeBridge, holder: { page: PageEntry }) {
  const recovery = fakeRecovery(pageEntry("copy", []), pageEntry("copy", []));
  const deps: FlushDeps = {
    publish: (page) => publishPage(page, bridgeDeps(bridge)),
    recovery: recovery.deps,
    privateWorkspaceId: () => "private",
    notify: () => undefined,
    applyContent: (_pageId, content) => {
      holder.page = { ...holder.page, content };
      return holder.page;
    },
    recordVersion: (pageId, version) => {
      if (pageId === holder.page._id) holder.page = { ...holder.page, contentVersion: version };
    },
  };
  return { deps, recovery };
}

function job(page: PageEntry) {
  return {
    page,
    id: page._id,
    stamp: `stamp-${page._id}`,
    confirmed: {} as Record<string, string>,
    forgotten: new Set<string>(),
    budget: { left: 5 },
  };
}

test("a 200's version reaches the page: after a reload the next PATCH is pinned to it", async () => {
  const bridge = createBridge({ p1: { version: 4, content: [para("b1", "teal")] } });
  const holder = { page: pageEntry("p1", [para("b1", "teal")], { contentVersion: 4 }) };
  setBase("p1", 4, [para("b1", "teal")]);
  const first = flushDepsFor(bridge, holder);
  holder.page = { ...holder.page, content: [para("b1", "crimson")] };
  assert.equal(await publishOutboxPage(job(holder.page), first.deps), "continue");
  assert.equal(holder.page.contentVersion, 5, "the page carries the version its own write produced");
  // A reload: the in-memory base is gone, the cached page is what is left.
  clearBase("p1");
  const second = flushDepsFor(bridge, holder);
  holder.page = { ...holder.page, content: [para("b1", "scarlet")] };
  assert.equal(await publishOutboxPage(job(holder.page), second.deps), "continue");
  assert.equal(bridge.patches[1].body.baseVersion, 5, "pinned to the reader's own last write");
  assert.deepEqual(second.recovery.calls, [], "no copy: the reader's own edit is not a conflict");
  assert.deepEqual(bridge.pages.get("p1")?.content, [para("b1", "scarlet")]);
  clearBase("p1");
});

test("the merged re-send's version reaches the page too", async () => {
  const bridge = createBridge({ p1: { version: 9, content: [para("b1", "base"), para("b2", "theirs")] } });
  const holder = { page: pageEntry("p1", [para("b1", "mine")], { contentVersion: 8 }) };
  setBase("p1", 8, [para("b1", "base")]);
  const { deps } = flushDepsFor(bridge, holder);
  assert.equal(await publishOutboxPage(job(holder.page), deps), "continue");
  assert.equal(bridge.patches.length, 2, "the write, then the merged re-send");
  assert.equal(holder.page.contentVersion, 10, "the page carries the re-send's version");
  clearBase("p1");
});

test("a keepalive that landed is not a conflict: the server already holds the edit", async () => {
  const bridge = createBridge({ p1: { version: 4, content: [para("b1", "teal")] } });
  const page = pageEntry("p1", [para("b1", "crimson")], { contentVersion: 4 });
  setBase("p1", 4, [para("b1", "teal")]);
  // The unload: the keepalive lands, but nothing in the closing tab reads its answer.
  publishPageKeepalive(page, bridgeDeps(bridge));
  assert.equal(bridge.keepalives[0].status, 200);
  // The next load replays the pending edit with no base content and the old version.
  clearBase("p1");
  const holder = { page };
  const { deps, recovery } = flushDepsFor(bridge, holder);
  assert.equal(await publishOutboxPage(job(page), deps), "continue");
  assert.deepEqual(recovery.calls, [], "no copy: both sides hold the same content");
  assert.deepEqual(bridge.pages.get("p1")?.content, [para("b1", "crimson")]);
  assert.equal(holder.page.contentVersion, 5, "the page caught up with the server's version");
  clearBase("p1");
});

test("rule 1's one exception: with no base, two equal copies are clean — there is nothing to guess", () => {
  const same = [para("b1", "crimson")];
  assert.equal(mergePageContent(null, same, [para("b1", "crimson")]).status, "clean");
  assert.equal(mergePageContent(null, same, [para("b1", "teal")]).status, "unresolved");
});
