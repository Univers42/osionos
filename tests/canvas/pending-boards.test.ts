import assert from "node:assert/strict";
import test from "node:test";

import { clearPendingBoard, startBoardCreation, usePendingBoards } from "../../src/features/whiteboard/model/pendingBoards.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const entry = (id: string) => usePendingBoards.getState().byBlockId[id];

test("a created board reaches onCreated once and is recorded", async () => {
  const calls: string[] = [];
  await startBoardCreation("b1", "Plan", (slug) => calls.push(slug), { client: { createBoard: async () => ({ slug: "abc123" }) } });
  assert.deepEqual(calls, ["abc123"]);
  assert.deepEqual(entry("b1"), { status: "created", slug: "abc123" });
  clearPendingBoard("b1");
  assert.equal(entry("b1"), undefined);
});

test("a second start while creating does not POST again", async () => {
  const gate = deferred<{ slug: string }>();
  let posts = 0;
  const client = { createBoard: () => { posts += 1; return gate.promise; } };
  const first = startBoardCreation("b2", "Plan", () => {}, { client });
  await startBoardCreation("b2", "Plan", () => {}, { client });
  assert.equal(posts, 1);
  gate.resolve({ slug: "abc123" });
  await first;
  clearPendingBoard("b2");
});

test("a failure is stored and never retried automatically", async () => {
  let posts = 0;
  const calls: string[] = [];
  await startBoardCreation("b3", "Plan", (slug) => calls.push(slug), {
    client: { createBoard: async () => { posts += 1; throw new Error("down"); } },
  });
  assert.deepEqual(entry("b3"), { status: "error", message: "down" });
  assert.equal(posts, 1);
  assert.deepEqual(calls, []);
  clearPendingBoard("b3");
});

test("a block deleted while the POST was in flight never reaches onCreated", async () => {
  const calls: string[] = [];
  await startBoardCreation("b4", "Plan", (slug) => calls.push(slug), {
    client: { createBoard: async () => ({ slug: "abc123" }) },
    blockExists: () => false,
  });
  assert.deepEqual(calls, []);
  assert.equal(entry("b4"), undefined);
});

test("Retry after an error starts a fresh creation", async () => {
  let posts = 0;
  const client = { createBoard: async () => { posts += 1; if (posts === 1) throw new Error("down"); return { slug: "abc123" }; } };
  await startBoardCreation("b5", "Plan", () => {}, { client });
  await startBoardCreation("b5", "Plan", () => {}, { client });
  assert.equal(posts, 2);
  assert.deepEqual(entry("b5"), { status: "created", slug: "abc123" });
  clearPendingBoard("b5");
});
