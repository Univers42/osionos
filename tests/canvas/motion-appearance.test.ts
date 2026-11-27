// The three motion axes of the personal appearance: every listed value round-trips, junk falls
// back to that axis's own default, and the defaults keep today's pixels (no attribute is written).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_APPEARANCE,
  EASINGS,
  MOTION_SPEEDS,
  OVERLAY_TRANSITIONS,
  PAGE_TRANSITIONS,
  PRESS_FEEDBACKS,
  parseAppearance,
} from "../../src/shared/config/theme.ts";
import { APPEARANCE_CHOICES } from "../../src/shared/config/appearanceChoices.ts";

const stored = (value: unknown) => parseAppearance(JSON.stringify(value));

const AXES = [
  ["pageTransition", PAGE_TRANSITIONS, "none"],
  ["overlayTransition", OVERLAY_TRANSITIONS, "default"],
  ["motionSpeed", MOTION_SPEEDS, "default"],
  ["easing", EASINGS, "standard"],
  ["pressFeedback", PRESS_FEEDBACKS, "default"],
] as const;

test("the defaults keep today's motion", () => {
  assert.equal(DEFAULT_APPEARANCE.pageTransition, "none");
  assert.equal(DEFAULT_APPEARANCE.overlayTransition, "default");
  assert.equal(DEFAULT_APPEARANCE.motionSpeed, "default");
  assert.equal(DEFAULT_APPEARANCE.easing, "standard");
  assert.equal(DEFAULT_APPEARANCE.pressFeedback, "default");
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

for (const [axis, values] of AXES) {
  test(`${axis}: every value has a label`, () => {
    const labelled = APPEARANCE_CHOICES[axis].options.map((option) => option.value);
    assert.deepEqual([...labelled].sort(), [...values].sort());
  });
}

const ATTRIBUTES = [
  ["motionSpeed", "data-motion-speed", MOTION_SPEEDS, "default"],
  ["easing", "data-easing", EASINGS, "standard"],
  ["pressFeedback", "data-press-feedback", PRESS_FEEDBACKS, "default"],
] as const;

test("every non-default value is in the pre-paint map and has a CSS selector", () => {
  const html = readFileSync("index.html", "utf8");
  const css = readFileSync("src/app/styles/motion.css", "utf8");
  for (const [axis, attribute, values, fallback] of ATTRIBUTES) {
    const mirrored = new RegExp(`${axis}: \\[([^\\]]*)\\]`).exec(html)?.[1] ?? "";
    for (const value of values.filter((candidate) => candidate !== fallback)) {
      assert.ok(mirrored.includes(`'${value}'`), `${axis}=${value} missing from index.html`);
      assert.ok(css.includes(`[${attribute}="${value}"]`), `${attribute}="${value}" missing from motion.css`);
    }
  }
});
