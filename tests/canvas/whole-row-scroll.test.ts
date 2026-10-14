// The cut of a menu's scroll region must land on a row edge, never inside a row.

import assert from "node:assert/strict";
import test from "node:test";

import { snappedHeight } from "../../src/shared/lib/dom/wholeRowScroll.ts";

const ROWS = [28, 56, 84, 112, 140, 168];

test("the region ends at the last row that fits whole", () => {
  assert.equal(snappedHeight(ROWS, 100), 84);
  assert.equal(snappedHeight(ROWS, 112), 112);
  assert.equal(snappedHeight(ROWS, 400), 168);
});

test("a first row taller than the limit keeps the limit, as there is no boundary to use", () => {
  assert.equal(snappedHeight([200, 228], 150), 150);
});

test("a region with no rows keeps the limit", () => {
  assert.equal(snappedHeight([], 150), 150);
});
