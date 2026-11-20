// The page font reaches headings and the title, not only body text (2026-11-20:
// Serif and Mono left every heading and the title in the theme's heading font).

import assert from "node:assert/strict";
import test from "node:test";

import { pageHeadingFontVars } from "../../src/shared/config/pageHeadingFont.ts";
import { EXTRA_PAGE_FONTS } from "../../src/shared/config/pageFontCatalog.ts";

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

test("every extra font sets both heading tokens to its own family", () => {
  for (const font of EXTRA_PAGE_FONTS) {
    assert.deepEqual(pageHeadingFontVars(font.id), {
      "--osio-font-heading": font.family,
      "--osio-font-display": font.family,
    });
  }
});
