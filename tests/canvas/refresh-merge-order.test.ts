// AM15 review r1: what a refresh does when its answer is out of order, when the base
// content was lost to a reload, and when both sides edited the same block.
//   P1: a GET that left before the client's own save landed answers after the 200. It is
//       older than the base: it must neither revert the editor nor pull the base back.
//   P2: after a reload the base is a version without content. A refresh answering that
//       same version IS the base content: it must be learned, so a later 409 can merge.
//   P3: a refresh that merges a block both sides changed keeps both variants, and says so
//       with the same notice the 409 path gives.
//   P4: an answer older than the version the page records is not stale when there is no
//       body to protect (boot race, or a database restored from a backup): the body loads.
//       After a reload (base is a version alone) a clean page takes a restored copy.

import assert from "node:assert/strict";
import test from "node:test";

import { useToastStore } from "@osionos/ui/primitives/useToastStore";
import { baseFor, clearBase } from "@/store/sync/pageBase";
import { createBridge, para } from "./page-version.fixtures";
import { PAGE_ID, blockIds, loadPage, openPage, refresh, save, serveReads, textOf, typeLocally } from "./refresh-merge.fixtures";

const { usePageStore } = await import("../../src/store/usePageStore.ts");
const { derivePageState } = await import("../../src/store/pageStore.helpers.ts");

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

/** The open page as a boot leaves it: listed at `version`, body not loaded, no base yet. */
function unloadPage(version: number): void {
  loadPage([para("b1", "x")], version, { contentVersion: version });
  clearBase(PAGE_ID);
  usePageStore.setState({ ...derivePageState({ ws: [{ ...openPage(), content: undefined }] }) });
}

test("P4 restore: an unloaded page recording v7 loads the server's v6 body", async () => {
  serveReads(createBridge({ [PAGE_ID]: { version: 6, content: [para("b1", "v6 body")] } }));
  unloadPage(7);
  await refresh();
  assert.equal(textOf(openPage().content ?? [], "b1"), "v6 body", "the body loads (no 'failed')");
});

test("P4 boot race: the page list moves the version while the GET is out, the body still loads", async () => {
  serveReads(createBridge({ [PAGE_ID]: { version: 6, content: [para("b1", "v6 body")] } }));
  const read = globalThis.fetch;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    usePageStore.getState().setPageContentVersion(PAGE_ID, 7);
    return read(...args);
  }) as typeof fetch;
  unloadPage(5);
  await refresh();
  assert.equal(textOf(openPage().content ?? [], "b1"), "v6 body");
});

test("restore after a reload: a loaded page with no unsaved edits takes the restored copy", async () => {
  serveReads(createBridge({ [PAGE_ID]: { version: 3, content: [para("b1", "restored")] } }));
  loadPage(typed, 7, { contentVersion: 7 });
  clearBase(PAGE_ID);
  await refresh();
  assert.equal(textOf(openPage().content ?? [], "b1"), "restored", "the editor shows the server's copy");
  assert.equal(baseFor(openPage()).version, 3, "the next save goes against the restored version");
  assert.deepEqual(baseFor(openPage()).content, [para("b1", "restored")]);
});

// Pins the Caveat on isStaleAnswer: inside the session a restore reads as an out-of-order answer.
test("restore during a session: ignored like any older answer until a reload", async () => {
  serveReads(createBridge({ [PAGE_ID]: { version: 3, content: [para("b1", "restored")] } }));
  loadPage(typed, 7, { contentVersion: 7 });
  await refresh();
  assert.deepEqual(openPage().content, typed);
  assert.equal(baseFor(openPage()).version, 7);
});

test("restore: a loaded page with unsaved edits keeps the keystrokes", async () => {
  serveReads(createBridge({ [PAGE_ID]: { version: 3, content: [para("b1", "restored")] } }));
  loadPage(loaded, 7, { contentVersion: 7 });
  typeLocally(typed);
  await refresh();
  assert.deepEqual(openPage().content, typed);
});
