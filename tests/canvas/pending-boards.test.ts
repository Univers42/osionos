import assert from "node:assert/strict";
import test from "node:test";

import { clearPendingBoard, isBoardPending, requestNewBoard, usePendingBoards } from "../../src/features/whiteboard/model/pendingBoards.ts";

test("a requested board stays pending until cleared", () => {
  requestNewBoard("b1");
  assert.equal(isBoardPending("b1"), true);
  assert.equal(isBoardPending("b2"), false);
  clearPendingBoard("b1");
  assert.equal(isBoardPending("b1"), false);
});

test("asking twice, or clearing an unknown block, changes no state", () => {
  requestNewBoard("b3");
  const before = usePendingBoards.getState().blockIds;
  requestNewBoard("b3");
  clearPendingBoard("unknown");
  assert.equal(usePendingBoards.getState().blockIds, before);
  clearPendingBoard("b3");
});
