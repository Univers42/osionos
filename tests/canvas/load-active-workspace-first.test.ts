// The active workspace's page list loads alone before the others (prismatica#55): fired
// together, 17 lists queued on the bridge and the one the sidebar shows landed after 8 others.

import assert from "node:assert/strict";
import test from "node:test";

import { loadActiveWorkspaceFirst } from "../../src/store/sync/loadActiveWorkspaceFirst.ts";

function recorder() {
  const started: string[] = [];
  const pending = new Map<string, () => void>();
  const load = (id: string) => {
    started.push(id);
    return new Promise<string>((resolve) => pending.set(id, () => resolve(id)));
  };
  return { started, pending, load };
}

test("no other workspace starts before the active one has landed", async () => {
  const { started, pending, load } = recorder();
  const done = loadActiveWorkspaceFirst(["a", "b", "active", "c"], "active", load);
  await Promise.resolve();
  assert.deepEqual(started, ["active"]);
  pending.get("active")!();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["active", "a", "b", "c"]);
  for (const id of ["a", "b", "c"]) pending.get(id)!();
  assert.deepEqual((await done).map((r) => r.status === "fulfilled" && r.value), ["active", "a", "b", "c"]);
});

test("a failed active workspace still lets the others load", async () => {
  const results = await loadActiveWorkspaceFirst(["a", "active"], "active", async (id) => {
    if (id === "active") throw new Error("offline");
    return id;
  });
  assert.deepEqual(results.map((r) => r.status), ["rejected", "fulfilled"]);
});

test("with no active workspace, or one not in the list, all load together", async () => {
  for (const active of [null, "elsewhere"]) {
    const { started, pending, load } = recorder();
    const done = loadActiveWorkspaceFirst(["a", "b"], active, load);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, ["a", "b"]);
    pending.forEach((resolve) => resolve());
    assert.equal((await done).length, 2);
  }
});
