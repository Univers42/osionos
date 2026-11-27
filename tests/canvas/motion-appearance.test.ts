// The three motion axes of the personal appearance: every listed value round-trips, junk falls
// back to that axis's own default, and the defaults keep today's pixels (no attribute is written).

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_APPEARANCE,
  MOTION_SPEEDS,
  OVERLAY_TRANSITIONS,
  PAGE_TRANSITIONS,
  parseAppearance,
} from "../../src/shared/config/theme.ts";

const stored = (value: unknown) => parseAppearance(JSON.stringify(value));

const AXES = [
  ["pageTransition", PAGE_TRANSITIONS, "none"],
  ["overlayTransition", OVERLAY_TRANSITIONS, "default"],
  ["motionSpeed", MOTION_SPEEDS, "default"],
] as const;

test("the defaults keep today's motion", () => {
  assert.equal(DEFAULT_APPEARANCE.pageTransition, "none");
  assert.equal(DEFAULT_APPEARANCE.overlayTransition, "default");
  assert.equal(DEFAULT_APPEARANCE.motionSpeed, "default");
});

for (const [axis, values, fallback] of AXES) {
  test(`${axis} accepts every listed value`, () => {
    for (const value of values) assert.equal(stored({ [axis]: value })[axis], value);
  });

  test(`${axis} falls back to ${fallback} on junk and leaves the other axes alone`, () => {
    for (const junk of ["", "spin", 3, null, ["fade"], {}]) {
      const parsed = stored({ [axis]: junk, density: "compact" });
      assert.equal(parsed[axis], fallback);
      assert.equal(parsed.density, "compact");
    }
    assert.equal(parseAppearance(null)[axis], fallback);
  });
}
