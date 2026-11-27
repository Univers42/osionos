// The appearance summary's pure half: every axis a Settings section renders jumps to that
// section, labels read like the rows, and the jump scrolls instantly under reduced motion.

import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_APPEARANCE } from "../../src/shared/config/theme.ts";
import {
  axisLabel,
  jumpBehavior,
  rowAnchorFor,
  sectionFor,
  summaryLine,
  valueLabel,
} from "../../src/features/theme/model/appearanceSummaryModel.ts";

const SECTIONS = ["style", "color", "layout", "motion", "accessibility"];
const NO_ROW: Record<string, string> = {};

test("every axis a section renders maps to that section", () => {
  for (const axis of Object.keys(DEFAULT_APPEARANCE)) {
    if (axis in NO_ROW) continue;
    assert.ok(SECTIONS.includes(sectionFor(axis)), `axis "${axis}" falls through to ${sectionFor(axis)}`);
  }
});

test("known axes land in the section that renders them", () => {
  assert.equal(sectionFor("radius"), "layout");
  assert.equal(sectionFor("caretShape"), "color");
  assert.equal(sectionFor("surface"), "style");
  assert.equal(sectionFor("motion"), "accessibility");
  assert.equal(sectionFor("motionSpeed"), "motion");
  assert.equal(sectionFor("somethingNew"), "appearance");
});

test("motion axes with a row anchor use it, the rest do not", () => {
  assert.equal(rowAnchorFor("motionSpeed"), "motion-speed");
  assert.equal(rowAnchorFor("radius"), null);
});

test("labels follow the rows, with a readable fallback", () => {
  assert.equal(axisLabel("radius"), "Corners");
  assert.equal(valueLabel("radius", "round"), "Round");
  assert.equal(axisLabel("accent"), "Accent color");
  assert.equal(valueLabel("accent", "custom"), "Custom");
  assert.equal(axisLabel("hue"), "Accent hue");
  assert.equal(valueLabel("hue", 200), "200°");
  assert.equal(axisLabel("pressFeedbackStyle"), "Press feedback style");
});

test("the count line is singular, plural or the all-default line", () => {
  assert.equal(summaryLine(0), "Everything is at its default.");
  assert.equal(summaryLine(1), "1 setting changed from the default.");
  assert.equal(summaryLine(2), "2 settings changed from the default.");
});

test("a jump is instant when motion is reduced, by choice or by the system", () => {
  assert.equal(jumpBehavior("reduce", false), "auto");
  assert.equal(jumpBehavior("system", true), "auto");
  assert.equal(jumpBehavior("full", true), "smooth");
  assert.equal(jumpBehavior("system", false), "smooth");
});
