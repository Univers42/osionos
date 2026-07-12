/* ************************************************************************** */
/*  layout-persist-scope.test.ts — open tabs are private per user+workspace   */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

// Minimal Storage double: data keys are the ONLY enumerable own props, matching
// how Object.keys(localStorage) behaves in browsers (the legacy-wipe relies on it).
function makeStorage(): Record<string, string> {
  const store: Record<string, string> = {};
  Object.defineProperties(store, {
    getItem: { value: (key: string) => (key in store ? store[key] : null) },
    setItem: { value: (key: string, value: string) => { store[key] = String(value); } },
    removeItem: { value: (key: string) => { delete store[key]; } },
  });
  return store;
}

const storage = makeStorage();
(globalThis as Record<string, unknown>).window = globalThis;
(globalThis as Record<string, unknown>).localStorage = storage;

const { freshLayout, layoutScope, loadLayout, saveLayout } = await import(
  "../../src/widgets/workspace-grid/model/layoutPersist.ts"
);

test("layoutScope: user+workspace identity; no user = no scope", () => {
  assert.equal(layoutScope("u1", "w1"), "u1:w1");
  assert.equal(layoutScope("u1", ""), "u1:none");
  assert.equal(layoutScope("", "w1"), "");
});

test("tabs are private per scope: another user or workspace loads fresh", () => {
  const mine = freshLayout();
  (mine.root as { tabs: { title: string }[] }).tabs.push({ title: "Secret doc" } as never);
  saveLayout(mine, layoutScope("u1", "w1"));

  // Same user, other workspace → fresh single-Home layout, no foreign tabs.
  const otherWs = loadLayout(layoutScope("u1", "w2"));
  assert.equal((otherWs.root as { tabs: unknown[] }).tabs.length, 1);

  // Other user entirely → fresh too.
  const otherUser = loadLayout(layoutScope("u2", "w1"));
  assert.equal((otherUser.root as { tabs: unknown[] }).tabs.length, 1);

  // The owner gets their own tabs back.
  const back = loadLayout(layoutScope("u1", "w1"));
  assert.equal((back.root as { tabs: { title: string }[] }).tabs.some((t) => t.title === "Secret doc"), true);
});

test("an unowned tree (empty scope) is never persisted", () => {
  const before = Object.keys(storage).length;
  saveLayout(freshLayout(), "");
  assert.equal(Object.keys(storage).length, before);
});

test("legacy v1 slots (cross-contamination risk) are wiped on load", () => {
  storage["osionos.workspace.layout.v1"] = "{}";
  storage["osionos.workspace.layout.v1.some-user"] = "{}";
  loadLayout(layoutScope("u1", "w1"));
  assert.equal("osionos.workspace.layout.v1" in storage, false);
  assert.equal("osionos.workspace.layout.v1.some-user" in storage, false);
});
