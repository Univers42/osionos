// AM15 (devil ruling on AI modes, H2): a write the server makes to an open page (an
// approved add_blocks, then reloadWrittenPage) refreshes it while the reader has
// unpublished keystrokes. The refresh moved the base to the server's copy BEFORE it
// looked at those keystrokes, so one side was lost silently:
//   - server copy newer: its body replaced the keystrokes;
//   - server copy not newer: the keystrokes stayed, but the base said "already merged",
//     so the next save passed the version check and erased the server's blocks.
// Both branches must keep both sides, in the store and on the server after the save.

import assert from "node:assert/strict";
import test from "node:test";

import { createBridge, para } from "./page-version.fixtures";
import { baseFor, setBase } from "@/store/sync/pageBase";
import { PAGE_ID, blockIds, loadPage, openPage, refresh, save, serveReads, textOf, typeLocally } from "./refresh-merge.fixtures";

const loaded = [para("b1", "draft")];
const typed = [para("b1", "draft + my keystrokes")];
const aiBlock = para("ai-1", "summary from the assistant");

/** Loaded at v5, typed (unpublished), then the server appends one block (v6). */
function scenario(local: { contentVersion?: number }) {
  const bridge = createBridge({ [PAGE_ID]: { version: 5, content: loaded } });
  serveReads(bridge);
  loadPage(loaded, 5, local);
  typeLocally(typed);
  const row = bridge.pages.get(PAGE_ID)!;
  row.content = [...row.content, aiBlock];
  row.version = 6;
  return bridge;
}

const branches = [
  ["dirty + server newer (content version 6 > 5)", { contentVersion: 5 }],
  ["dirty + server not newer (no local version, keystroke after the server's clock)", {}],
] as const;

for (const [branch, local] of branches) {
  test(`AM15 ${branch}: the refresh keeps the keystrokes and shows the server's block`, async () => {
    scenario(local);
    await refresh();
    const shown = openPage().content ?? [];
    assert.equal(textOf(shown, "b1"), "draft + my keystrokes", "the unpublished keystrokes stay in the editor");
    assert.ok(blockIds(shown).includes("ai-1"), "the server's block reaches the editor");
  });

  test(`AM15 ${branch}: the next save keeps the server's block and the keystrokes`, async () => {
    const bridge = scenario(local);
    await refresh();
    assert.equal(await save(bridge), false, "the save merges, it does not go to a copy");
    const stored = bridge.pages.get(PAGE_ID)!.content;
    assert.ok(blockIds(stored).includes("ai-1"), "the save does not erase the server's block");
    assert.equal(textOf(stored, "b1"), "draft + my keystrokes", "the keystrokes reach the server");
  });
}

test("a refresh with no server change keeps the keystrokes and saves them once", async () => {
  const bridge = createBridge({ [PAGE_ID]: { version: 5, content: loaded } });
  serveReads(bridge);
  loadPage(loaded, 5, { contentVersion: 5 });
  typeLocally(typed);
  await refresh();
  assert.deepEqual(openPage().content, typed);
  assert.equal(await save(bridge), false);
  assert.deepEqual(bridge.pages.get(PAGE_ID)!.content, typed);
  assert.equal(bridge.pages.get(PAGE_ID)!.version, 6);
});

test("no base content (after a reload): the base stays, so the save is refused and the server's block is never erased", async () => {
  const bridge = scenario({ contentVersion: 5 });
  setBase(PAGE_ID, 5, null);
  await refresh();
  assert.equal(textOf(openPage().content ?? [], "b1"), "draft + my keystrokes", "the keystrokes stay");
  assert.equal(baseFor(openPage()).version, 5, "the base did not move over the keystrokes");
  await save(bridge);
  assert.ok(blockIds(bridge.pages.get(PAGE_ID)!.content).includes("ai-1"), "the 409 kept the server's copy (C25)");
});

test("a fetch that left before the client's own save landed is stale: the base stays and the save is clean", async () => {
  const bridge = createBridge({ [PAGE_ID]: { version: 5, content: loaded } });
  serveReads(createBridge({ [PAGE_ID]: { version: 5, content: loaded } }));
  loadPage(loaded, 5, { contentVersion: 5 });
  typeLocally(typed);
  await save(bridge);
  const more = [para("b1", "draft + my keystrokes + more")];
  typeLocally(more);
  await refresh();
  assert.equal(baseFor(openPage()).version, 6, "the stale answer did not pull the base back");
  assert.deepEqual(openPage().content, more);
  assert.equal(await save(bridge), false);
  assert.deepEqual(bridge.pages.get(PAGE_ID)!.content, more, "no conflict copy of b1");
});
