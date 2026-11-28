// The bottom sheet's Tab trap: focus wraps at both ends and recovers from outside the sheet.

import assert from "node:assert/strict";
import test from "node:test";

import { nextFocusIndex } from "../../src/shared/ui/BottomSheet/focusWrap.ts";

test("Tab advances and wraps from the last item to the first", () => {
  assert.equal(nextFocusIndex(3, 0, false), 1);
  assert.equal(nextFocusIndex(3, 2, false), 0);
});

test("Shift+Tab retreats and wraps from the first item to the last", () => {
  assert.equal(nextFocusIndex(3, 2, true), 1);
  assert.equal(nextFocusIndex(3, 0, true), 2);
});

test("focus outside the sheet is pulled in at the matching end", () => {
  assert.equal(nextFocusIndex(3, -1, false), 0);
  assert.equal(nextFocusIndex(3, -1, true), 2);
});

test("an empty sheet has nowhere to focus", () => {
  assert.equal(nextFocusIndex(0, -1, false), -1);
});
