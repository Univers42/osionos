// The motion axes of the personal appearance: every listed value round-trips, junk falls
// back to that axis's own default, and the defaults keep today's pixels (no attribute is written).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ATTRIBUTE_AXES,
  DEFAULT_APPEARANCE,
  DRAG_MOTIONS,
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
  ["dragMotion", DRAG_MOTIONS, "slide"],
] as const;

test("the defaults keep today's motion", () => {
  assert.equal(DEFAULT_APPEARANCE.pageTransition, "none");
  assert.equal(DEFAULT_APPEARANCE.overlayTransition, "default");
  assert.equal(DEFAULT_APPEARANCE.motionSpeed, "default");
  assert.equal(DEFAULT_APPEARANCE.easing, "standard");
  assert.equal(DEFAULT_APPEARANCE.pressFeedback, "default");
  assert.equal(DEFAULT_APPEARANCE.dragMotion, "slide");
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
  ["dragMotion", "data-drag-motion", DRAG_MOTIONS, "slide"],
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

// The accent is booted by its own branch (a shape check plus the custom hue), not from the table.
test("index.html boots exactly the non-default values of every axis theme.ts writes to <html>", () => {
  const table = /var axes = \{([\s\S]*?)\};/.exec(readFileSync("index.html", "utf8"))?.[1] ?? "";
  const booted = new Map([...table.matchAll(/(\w+): \[([^\]]*)\]/g)].map((m) => [m[1], [...m[2].matchAll(/'([^']+)'/g)].map((v) => v[1]).sort()]));
  const written = ATTRIBUTE_AXES.filter((axis) => axis !== "accent");
  assert.deepEqual([...booted.keys()].sort(), [...written].sort());
  for (const axis of written) {
    const nonDefault = APPEARANCE_CHOICES[axis].options.map((option) => option.value).filter((value) => value !== DEFAULT_APPEARANCE[axis]);
    assert.deepEqual(booted.get(axis), [...nonDefault].sort(), axis);
  }
});
