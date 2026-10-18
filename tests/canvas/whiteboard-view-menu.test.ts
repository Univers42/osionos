import assert from "node:assert/strict";
import test from "node:test";

import { createBoardInNewTab } from "../../src/features/whiteboard/model/newBoardTab.ts";
import { whiteboardViewItems } from "../../src/widgets/top-bar/model/whiteboardMenuItems.ts";

const noop = () => {};

test("the View menu offers New whiteboard where New drawing was, then the gallery", () => {
  const items = whiteboardViewItems(true, { newBoard: noop, openWhiteboard: noop });
  assert.deepEqual(items.map((item) => [item.id, item.label]), [
    ["view.new-whiteboard", "New whiteboard"],
    ["view.whiteboard", "Whiteboard"],
  ]);
});

test("neither item is offered when the whiteboard is unavailable", () => {
  assert.deepEqual(whiteboardViewItems(false, { newBoard: noop, openWhiteboard: noop }), []);
});

test("New whiteboard runs the board creation, not the gallery", () => {
  const calls: string[] = [];
  const [newBoard] = whiteboardViewItems(true, { newBoard: () => calls.push("new"), openWhiteboard: () => calls.push("gallery") });
  newBoard.run();
  assert.deepEqual(calls, ["new"]);
});

test("a created board opens in a tab on its slug and reports nothing", async () => {
  const opened: [string, string][] = [];
  const errors: string[] = [];
  const titles: string[] = [];
  await createBoardInNewTab(
    { createBoard: async (title) => { titles.push(title); return { slug: "abc123def456" }; } },
    { openBoard: (slug, title) => opened.push([slug, title]), reportError: (message) => errors.push(message) },
  );
  assert.deepEqual(titles, ["Untitled"]);
  assert.deepEqual(opened, [["abc123def456", "Untitled"]]);
  assert.deepEqual(errors, []);
});

test("a failed creation reports the service's message and opens no tab", async () => {
  const opened: string[] = [];
  const errors: string[] = [];
  await createBoardInNewTab(
    { createBoard: async () => { throw new Error("Board service is down."); } },
    { openBoard: (slug) => opened.push(slug), reportError: (message) => errors.push(message) },
  );
  assert.deepEqual(opened, []);
  assert.deepEqual(errors, ["Board service is down."]);
});

test("a second click while a creation is in flight creates no second board", async () => {
  let release: (value: { slug: string }) => void = noop;
  let posts = 0;
  const client = { createBoard: () => { posts += 1; return new Promise<{ slug: string }>((resolve) => { release = resolve; }); } };
  const opened: string[] = [];
  const target = { openBoard: (slug: string) => opened.push(slug), reportError: noop };
  const first = createBoardInNewTab(client, target);
  await createBoardInNewTab(client, target);
  release({ slug: "abc123def456" });
  await first;
  assert.equal(posts, 1);
  assert.deepEqual(opened, ["abc123def456"]);
  const third = createBoardInNewTab(client, target);
  assert.equal(posts, 2, "a finished creation does not block the next one");
  release({ slug: "def456abc123" });
  await third;
});
