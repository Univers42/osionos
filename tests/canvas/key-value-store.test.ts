import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryKeyValueStore } from "./support/memory-key-value-store.ts";

test("key-value-store: reads contain only the requested keys that are present", async () => {
  const store = createMemoryKeyValueStore({ present: 0, nil: null });
  const current = await store.update(["present", "missing", "nil"], () => null);

  assert.deepEqual([...current], [["present", 0], ["nil", null]]);
  assert.equal(current.has("missing"), false);
});

test("key-value-store: a write is visible to the next update", async () => {
  const store = createMemoryKeyValueStore();
  await store.update([], () => ({ key: "value" }));
  const current = await store.update(["key"], () => null);

  assert.equal(current.get("key"), "value");
});

test("key-value-store: write-if-absent keeps the first value", async () => {
  const store = createMemoryKeyValueStore();
  for (const value of ["first", "second"]) {
    await store.update(["key"], current => current.has("key") ? null : { key: value });
  }

  assert.equal(store.entries.get("key"), "first");
});

test("key-value-store: a throwing change rejects without writing", async () => {
  const store = createMemoryKeyValueStore({ kept: 1 });
  const failure = new Error("change failed");

  await assert.rejects(store.update(["kept"], () => { throw failure; }), error => error === failure);
  assert.deepEqual([...store.entries], [["kept", 1]]);
  assert.equal(store.writes, 0);
});

test("key-value-store: failed writes are atomic but read-only updates still resolve", async () => {
  const store = createMemoryKeyValueStore();
  store.failWrites = true;

  await assert.rejects(store.update([], () => ({ key: "value" })), /write failed/);
  assert.equal(store.entries.has("key"), false);
  const current = await store.update(["key"], () => null);
  assert.equal(current.size, 0);
  assert.equal(store.writes, 0);
});

test("key-value-store: delayed updates settle in call order and read prior writes", async () => {
  const store = createMemoryKeyValueStore();
  store.delayMs = 50;
  const settled: string[] = [];
  let seenBySecond: unknown;

  const first = store.update(["count"], () => ({ count: 1 })).then(() => { settled.push("first"); });
  const second = store.update(["count"], current => {
    seenBySecond = current.get("count");
    return { count: 2 };
  }).then(() => { settled.push("second"); });
  await Promise.all([first, second]);

  assert.equal(seenBySecond, 1);
  assert.deepEqual(settled, ["first", "second"]);
  assert.equal(store.entries.get("count"), 2);
});

test("key-value-store: close makes later updates reject asynchronously", async () => {
  const store = createMemoryKeyValueStore();
  store.close();
  let update: Promise<ReadonlyMap<string, unknown>> | undefined;

  assert.doesNotThrow(() => { update = store.update([], () => ({ key: "value" })); });
  assert.ok(update);
  await assert.rejects(update, /closed/);
  assert.equal(store.entries.size, 0);
});

test("key-value-store: writes counts only updates with at least one entry", async () => {
  const store = createMemoryKeyValueStore();

  await store.update([], () => null);
  await store.update([], () => ({}));
  await store.update([], () => ({ first: 1 }));
  await store.update([], () => null);
  await store.update([], () => ({ second: 2 }));

  assert.equal(store.writes, 2);
});
