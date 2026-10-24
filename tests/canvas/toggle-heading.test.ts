// A toggle's summary and a heading block are the same typography. The class
// comes from the one heading source (osio-h1..h4), never from a size restated
// here, so the toggle cannot drift from the block it imitates.

import assert from "node:assert/strict";
import test from "node:test";

import { getToggleHeadingClass } from "../../src/entities/block/model/toggleHeading.ts";

test("levels 1 to 4 map to the shared heading utilities", () => {
  assert.equal(getToggleHeadingClass(1), "osio-h1");
  assert.equal(getToggleHeadingClass(2), "osio-h2");
  assert.equal(getToggleHeadingClass(3), "osio-h3");
  assert.equal(getToggleHeadingClass(4), "osio-h4");
});

test("levels 5 and 6 and a plain toggle keep the small UI text", () => {
  for (const level of [5, 6, undefined] as const) {
    assert.doesNotMatch(getToggleHeadingClass(level), /osio-h/);
    assert.match(getToggleHeadingClass(level), /text-sm/);
  }
});
