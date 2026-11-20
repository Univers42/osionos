// The extended page-font catalog stays self-hosted and remains safe for older clients.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { EXTRA_PAGE_FONTS, extraPageFont, knownPageFont } from "../../src/shared/config/pageFontCatalog.ts";
import { mergeServerPageConfig, resolvePageConfig } from "../../src/shared/config/pageConfigStore.ts";
import { pageHeadingFontVars } from "../../src/shared/config/pageHeadingFont.ts";

const UNKNOWN_FONT = "comic-sans-2030";
const DEFAULT_FAMILY = resolvePageConfig().cssTokens.fontFamily;

test("knownPageFont accepts extras and falls back for unknown or missing fonts", () => {
  assert.equal(knownPageFont("lora"), "lora");
  assert.equal(knownPageFont("x y"), "default");
  assert.equal(knownPageFont(undefined), "default");
  assert.equal(knownPageFont("serif"), "serif");
});

test("the catalog finds every extra by its page font id", () => {
  assert.equal(EXTRA_PAGE_FONTS.length, 8);
  for (const font of EXTRA_PAGE_FONTS) assert.equal(extraPageFont(font.id), font);
  assert.equal(extraPageFont(UNKNOWN_FONT), undefined);
});

test("every extra survives page config resolution", () => {
  for (const font of EXTRA_PAGE_FONTS) {
    assert.equal(resolvePageConfig(undefined, { font: font.id }).font, font.id);
    assert.equal(resolvePageConfig(undefined, { font: font.id }).cssTokens.fontFamily, font.family);
  }
});

test("an unknown stored font survives resolution and server merges without changing tokens", () => {
  const updates = { font: UNKNOWN_FONT as never };
  const resolved = resolvePageConfig(undefined, updates);
  const merged = mergeServerPageConfig(undefined, updates);
  assert.equal(resolved.font, UNKNOWN_FONT);
  assert.equal(merged?.font, UNKNOWN_FONT);
  assert.equal(resolved.cssTokens.fontFamily, DEFAULT_FAMILY);
  assert.equal(merged?.cssTokens.fontFamily, DEFAULT_FAMILY);
  assert.deepEqual(pageHeadingFontVars(UNKNOWN_FONT as never), {});
});

test("the fetch script contains every catalog source and public file as a pair", () => {
  const source = readFileSync(new URL("../../scripts/fetch-fonts.mjs", import.meta.url), "utf8");
  for (const font of EXTRA_PAGE_FONTS) {
    assert.ok(source.includes(`["${font.source}", "${font.file}"]`), `${font.id} is missing from fetch-fonts.mjs`);
  }
});

test("fonts.css has a self-hosted @font-face for every catalog file", () => {
  const css = readFileSync(new URL("../../src/app/styles/fonts.css", import.meta.url), "utf8");
  const blocks = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  for (const font of EXTRA_PAGE_FONTS) {
    const src = `src: url("/fonts/${font.file}") format("woff2")`;
    assert.ok(blocks.some((block) => block.includes(src)), `${font.id} is missing its @font-face`);
  }
});
