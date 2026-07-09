/* ************************************************************************** */
/*  cover-position.test.ts — pure math for the page-cover reposition tool    */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_COVER_POSITION,
  clampCoverPosition,
  nextCoverPosition,
} from "../../src/entities/page/ui/coverPositionMath.ts";

test("clampCoverPosition bounds to 0..100 and defaults non-finite input", () => {
  assert.equal(clampCoverPosition(-10), 0);
  assert.equal(clampCoverPosition(140), 100);
  assert.equal(clampCoverPosition(37), 37);
  assert.equal(clampCoverPosition(Number.NaN), DEFAULT_COVER_POSITION);
});

test("nextCoverPosition: dragging DOWN reveals the top, UP reveals the bottom", () => {
  // 200px-tall frame, starting centered (50)
  assert.equal(nextCoverPosition(50, 100, 200), 0); // drag down half a frame → top
  assert.equal(nextCoverPosition(50, -100, 200), 100); // drag up half a frame → bottom
  assert.equal(nextCoverPosition(50, 0, 200), 50); // no movement → unchanged
  assert.equal(nextCoverPosition(50, 40, 200), 30); // drag down 40px → 50 - 20
});

test("nextCoverPosition clamps overshoot and tolerates a zero-height frame", () => {
  assert.equal(nextCoverPosition(10, 1000, 200), 0); // huge downward drag clamps at 0
  assert.equal(nextCoverPosition(90, -1000, 200), 100); // huge upward drag clamps at 100
  assert.equal(nextCoverPosition(50, 100, 0), 50); // no measurable frame → unchanged
});
