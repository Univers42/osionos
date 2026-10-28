import assert from "node:assert/strict";
import test from "node:test";

import { whiteboardViewItems } from "../../src/widgets/top-bar/model/whiteboardMenuItems.ts";

test("the View menu offers the Whiteboard gallery", () => {
  const calls: string[] = [];
  const items = whiteboardViewItems(true, () => calls.push("gallery"));
  assert.deepEqual(items.map((item) => [item.id, item.label]), [["view.whiteboard", "Whiteboard"]]);
  items[0].run();
  assert.deepEqual(calls, ["gallery"]);
});

test("nothing is offered when the whiteboard is unavailable", () => {
  assert.deepEqual(whiteboardViewItems(false, () => {}), []);
});
