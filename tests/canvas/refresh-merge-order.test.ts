// AM15 review r1: what a refresh does when its answer is out of order, when the base
// content was lost to a reload, and when both sides edited the same block.
//   P1: a GET that left before the client's own save landed answers after the 200. It is
//       older than the base: it must neither revert the editor nor pull the base back.
//   P2: after a reload the base is a version without content. A refresh answering that
//       same version IS the base content: it must be learned, so a later 409 can merge.
//   P3: a refresh that merges a block both sides changed keeps both variants, and says so
//       with the same notice the 409 path gives.

import assert from "node:assert/strict";
import test from "node:test";

import { useToastStore } from "@osionos/ui/primitives/useToastStore";
import { baseFor, clearBase } from "@/store/sync/pageBase";
import { createBridge, para } from "./page-version.fixtures";
import { PAGE_ID, blockIds, loadPage, openPage, refresh, save, serveReads, textOf, typeLocally } from "./refresh-merge.fixtures";

const loaded = [para("b1", "draft")];
const typed = [para("b1", "draft + my keystrokes")];
const sameTimeNotices = () => useToastStore.getState().toasts.filter((toast) => /at the same time/.test(toast.title));

test("P1 a stale answer on a clean page (own save landed while the GET was out) changes nothing", async () => {
  const bridge = createBridge({ [PAGE_ID]: { version: 5, content: loaded } });
  serveReads(createBridge({ [PAGE_ID]: { version: 5, content: loaded } }));
  loadPage(loaded, 5, { contentVersion: 5 });
  typeLocally(typed);
  assert.equal(await save(bridge), false);
  assert.equal(bridge.pages.get(PAGE_ID)!.version, 6);
  await refresh();
  assert.deepEqual(openPage().content, typed, "the editor keeps the saved text");
  assert.equal(baseFor(openPage()).version, 6, "the base does not move back");
  assert.deepEqual(baseFor(openPage()).content, typed);
});

test("P2 reload, refresh at the same version, then a server write: the save merges, no copy", async () => {
  const bridge = createBridge({ [PAGE_ID]: { version: 5, content: loaded } });
  serveReads(bridge);
  loadPage(loaded, 5, { contentVersion: 5 });
  typeLocally(typed);
  clearBase(PAGE_ID);
  await refresh();
  assert.deepEqual(baseFor(openPage()).content, loaded, "the same-version answer is the base content");
  assert.deepEqual(openPage().content, typed, "the keystrokes stay");
  const row = bridge.pages.get(PAGE_ID)!;
  row.content = [...row.content, para("ai-1", "ai")];
  row.version = 6;
  assert.equal(await save(bridge), false, "the 409 merges instead of going to a copy page");
  const stored = bridge.pages.get(PAGE_ID)!.content;
  assert.equal(textOf(stored, "b1"), "draft + my keystrokes");
  assert.ok(blockIds(stored).includes("ai-1"));
});

test("P3 a same-block edit on both sides keeps both variants and warns the reader once", async () => {
  useToastStore.getState().clear();
  const bridge = createBridge({ [PAGE_ID]: { version: 5, content: loaded } });
  serveReads(bridge);
  loadPage(loaded, 5, { contentVersion: 5 });
  typeLocally(typed);
  const row = bridge.pages.get(PAGE_ID)!;
  row.content = [para("b1", "draft edited by AI")];
  row.version = 6;
  await refresh();
  const shown = openPage().content ?? [];
  assert.equal(textOf(shown, "b1"), "draft + my keystrokes", "the reader's variant stays in place");
  assert.ok(shown.some((block) => block.content === "draft edited by AI"), "the server's variant is kept beside it");
  assert.equal(sameTimeNotices().length, 1, "the reader is told both versions were kept");
  assert.equal(await save(bridge), false);
  assert.equal(sameTimeNotices().length, 1, "the save does not warn a second time");
});

test("a refresh without a same-block conflict warns nobody", async () => {
  useToastStore.getState().clear();
  const bridge = createBridge({ [PAGE_ID]: { version: 5, content: loaded } });
  serveReads(bridge);
  loadPage(loaded, 5, { contentVersion: 5 });
  typeLocally(typed);
  const row = bridge.pages.get(PAGE_ID)!;
  row.content = [...loaded, para("ai-1", "ai")];
  row.version = 6;
  await refresh();
  assert.equal(sameTimeNotices().length, 0);
});
