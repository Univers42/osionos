// Accent presets are generated like palettes: each one, in each mode, over each
// palette's own surfaces, has to be readable, and the committed files have to be
// what the seeds generate. The stored-appearance parser is held here too, since
// a corrupt localStorage value must never reach the DOM.

import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  GENERATED_ACCENT_REGISTRY,
  GENERATED_ACCENT_STYLESHEET,
  presetTokens,
  renderAccentRegistry,
  renderAccentStylesheet,
  withAccent,
} from "../../scripts/tokens/accents.mjs";
import { contrastFailures } from "../../scripts/tokens/contrast.mjs";
import { MODES, PALETTES } from "../../scripts/tokens/palettes.mjs";
import { ACCENT_PRESETS as PICKER_ACCENTS, DEFAULT_APPEARANCE, FIXED_ACCENT_PALETTES, parseAppearance } from "../../src/shared/config/theme.ts";
import { blocksOf, readAppFile } from "./tokens-css.ts";

const A_TOKENS = ["--osio-a-solid", "--osio-a-hover", "--osio-a-fg", "--osio-a-text", "--osio-a-subtle"];
const idOf = (entry: { id: string }) => entry.id;
const keepsOwnAccent = (palette: { contrast?: string }) => palette.contrast === "AAA";
const overridable = ACCENT_PRESETS.filter((preset: { id: string }) => preset.id !== DEFAULT_ACCENT);

test("the presets are the eight the design names, cobalt first and default", () => {
  assert.deepEqual(ACCENT_PRESETS.map(idOf), ["cobalt", "ember", "indigo", "violet", "rose", "green", "teal", "graphite"]);
  assert.equal(DEFAULT_ACCENT, "cobalt");
});

for (const preset of overridable) {
  for (const palette of PALETTES.filter((entry: { contrast?: string }) => !keepsOwnAccent(entry))) {
    for (const mode of MODES) {
      test(`${preset.id} over ${palette.id}/${mode} passes AA`, () => {
        const tokens = withAccent(palette, mode, presetTokens(preset.id, mode));
        assert.deepEqual(contrastFailures(tokens), []);
      });
    }
  }
}

test("a palette that promises AAA keeps its own accent: the accent blocks do not match it", () => {
  const aaa = PALETTES.filter(keepsOwnAccent).map(idOf);
  assert.deepEqual(aaa, ["contrast"]);
  assert.deepEqual([...FIXED_ACCENT_PALETTES], aaa);
  const css = readAppFile(GENERATED_ACCENT_STYLESHEET);
  const selectors = [...css.matchAll(/^(:root\[data-accent="[\w-]+"\][^{]*)\{/gm)].map(([, selector]) => selector);
  assert.equal(selectors.length, 16, "seven presets and the custom hue, each in two modes");
  for (const selector of selectors) assert.ok(selector.includes(':not([data-palette="contrast"])'), selector);
});

test("a preset states exactly the five accent tokens, as literal colours", () => {
  for (const preset of overridable) {
    for (const mode of MODES) {
      const tokens = presetTokens(preset.id, mode);
      assert.deepEqual(Object.keys(tokens), A_TOKENS);
      for (const value of Object.values(tokens)) assert.match(value as string, /^#[0-9A-F]{6}$/);
    }
  }
});

test("the generated stylesheet has one block per preset and mode, at specificity 0,3,0, and none for the default", () => {
  const css = readAppFile(GENERATED_ACCENT_STYLESHEET);
  const blocks = blocksOf(css, /^:root\[data-accent="[\w-]+"\]\[data-theme="(light|dark)"\]/);
  for (const preset of overridable) {
    for (const mode of MODES) {
      const block = blocks.get(`:root[data-accent="${preset.id}"][data-theme="${mode}"]:not([data-palette="contrast"])`);
      assert.ok(block, `${preset.id}/${mode}`);
      assert.deepEqual(block, presetTokens(preset.id, mode));
    }
  }
  assert.ok(!css.includes(`data-accent="${DEFAULT_ACCENT}"`));
});

test("the committed accent files are what the seeds generate", () => {
  assert.equal(readAppFile(GENERATED_ACCENT_STYLESHEET), renderAccentStylesheet());
  assert.equal(readAppFile(GENERATED_ACCENT_REGISTRY), renderAccentRegistry());
  assert.deepEqual(PICKER_ACCENTS.map(idOf), ACCENT_PRESETS.map(idOf));
  for (const entry of PICKER_ACCENTS) assert.match(entry.swatch, /^#[0-9A-F]{6}$/);
});

test("the default preset swatch is the default palette's own accent", () => {
  const cobalt = PICKER_ACCENTS.find((entry: { id: string }) => entry.id === DEFAULT_ACCENT);
  assert.equal(cobalt.swatch, withAccent(PALETTES[0], "light", {})["--osio-accent"]);
});

const stored = (value: unknown) => parseAppearance(JSON.stringify(value));

test("a missing or malformed stored appearance is the default", () => {
  assert.deepEqual(parseAppearance(null), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance(""), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance("{not json"), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance("[1,2]"), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance("42"), DEFAULT_APPEARANCE);
  assert.deepEqual(parseAppearance("null"), DEFAULT_APPEARANCE);
});

test("a valid stored appearance round-trips", () => {
  const value = { accent: "custom", hue: 140, density: "compact", radius: "round", uiScale: "large" };
  assert.deepEqual(stored(value), value);
  assert.equal(stored({ accent: "teal" }).accent, "teal");
});

test("each field falls back on its own when it is unknown or out of range", () => {
  const value = stored({ accent: "chartreuse", hue: 360, density: "dense", radius: "pointy", uiScale: "huge" });
  assert.deepEqual(value, DEFAULT_APPEARANCE);
  assert.equal(stored({ accent: "ember", hue: -1, density: "compact" }).density, "compact");
  assert.equal(stored({ accent: "ember", hue: -1 }).accent, "ember");
  assert.equal(stored({ hue: -1 }).hue, DEFAULT_APPEARANCE.hue);
  assert.equal(stored({ hue: "140" }).hue, DEFAULT_APPEARANCE.hue);
  assert.equal(stored({ hue: Number.NaN }).hue, DEFAULT_APPEARANCE.hue);
  assert.equal(stored({ hue: 359 }).hue, 359);
  assert.equal(stored({ hue: 0 }).hue, 0);
  assert.equal(stored({ hue: 140.6 }).hue, 141);
});
