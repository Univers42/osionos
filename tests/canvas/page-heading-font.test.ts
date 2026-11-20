// The page font reaches headings and the title, not only body text (2026-11-20:
// Serif and Mono left every heading and the title in the theme's heading font).

import assert from "node:assert/strict";
import test from "node:test";

import { pageHeadingFontVars } from "../../src/shared/config/pageHeadingFont.ts";

test("Default keeps the theme's heading and display fonts", () => {
  assert.deepEqual(pageHeadingFontVars("default"), {});
});

test("Serif and Mono set both the heading and the display font", () => {
  for (const [font, token] of [["serif", "--osio-font-family-serif"], ["mono", "--osio-font-family-mono"]] as const) {
    assert.deepEqual(pageHeadingFontVars(font), {
      "--osio-font-heading": `var(${token})`,
      "--osio-font-display": `var(${token})`,
    });
  }
});

test("an unknown stored font falls back to the theme", () => {
  assert.deepEqual(pageHeadingFontVars("comic" as never), {});
});
