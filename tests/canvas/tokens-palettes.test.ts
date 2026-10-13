// The app's colours are generated from a few seeds per palette. These tests
// hold the generator to what makes that safe: every palette is complete in both
// modes, every text/background pair is readable, and the committed stylesheet
// is exactly what the seeds produce.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ALIASES, resolveTokens } from "../../scripts/tokens/aliases.mjs";
import { CONTRAST_PAIRS, contrastFailures } from "../../scripts/tokens/contrast.mjs";
import { MODES, PALETTES } from "../../scripts/tokens/palettes.mjs";
import { modeTokens } from "../../scripts/tokens/ramps.mjs";
import { GENERATED_STYLESHEET, renderStylesheet } from "../../scripts/tokens/stylesheet.mjs";
import { WARM_PALETTE } from "../../src/shared/config/theme.ts";

const APP_ROOT = new URL("../../", import.meta.url);
const readAppFile = (path: string) => readFileSync(new URL(path, APP_ROOT), "utf8");

const LITERAL_COLOUR = /^(#[0-9A-F]{6}|rgba\(\d+, \d+, \d+, (0|1|0\.\d+)\))$/;

const defaultPalette = PALETTES[0];
const resolved = (mode: string) => resolveTokens(modeTokens(defaultPalette, mode));

for (const palette of PALETTES) {
  test(`palette "${palette.id}" defines the same tokens in light and dark`, () => {
    const [light, dark] = MODES.map((mode: string) => Object.keys(modeTokens(palette, mode)));
    assert.deepEqual(light, dark);
    assert.ok(light.length > 0);
  });

  for (const mode of MODES) {
    test(`palette "${palette.id}" ${mode}: every token resolves to a literal colour`, () => {
      const tokens = resolveTokens(modeTokens(palette, mode));
      for (const name of [...Object.keys(modeTokens(palette, mode)), ...Object.keys(ALIASES)]) {
        assert.match(tokens[name] ?? "", LITERAL_COLOUR, `${name} resolved to "${tokens[name]}"`);
      }
    });

    test(`palette "${palette.id}" ${mode}: every text and background pair passes WCAG AA`, () => {
      const failures = contrastFailures(resolveTokens(modeTokens(palette, mode)));
      assert.deepEqual(failures, []);
    });
  }
}

test("the contrast gate reports a pair that falls below its ratio", () => {
  const tokens = resolved("light");
  const unreadable = { ...tokens, "--osio-fg-muted": tokens["--osio-bg-surface"] };
  const failures: { text: string; background: string; ratio: number; required: number }[] = contrastFailures(unreadable);
  assert.ok(failures.every((failure) => failure.text === "--osio-fg-muted"));
  assert.deepEqual(
    failures.find((failure) => failure.background === "--osio-bg-surface"),
    { text: "--osio-fg-muted", background: "--osio-bg-surface", ratio: 1, required: 4.5 },
  );
});

test("the contrast gate refuses a pair that names a token nothing defines", () => {
  const tokens = resolved("light");
  const { "--osio-fg-default": _removed, ...withoutInk } = tokens;
  assert.throws(() => contrastFailures(withoutInk), /--osio-fg-default/);
});

test("every contrast pair asks for at least the AA ratio for text", () => {
  assert.ok(CONTRAST_PAIRS.length > 0);
  for (const pair of CONTRAST_PAIRS) assert.ok(pair.ratio >= 4.5, `${pair.text} on ${pair.background}`);
});

test("the default accent is the approved cobalt, and Update and links follow it", () => {
  const light = resolved("light");
  assert.equal(light["--osio-accent"], "#1F5BC4");
  for (const mode of MODES) {
    const tokens = resolved(mode);
    assert.equal(tokens["--osio-update"], tokens["--osio-accent"]);
    assert.equal(tokens["--osio-update-hover"], tokens["--osio-accent-hover"]);
    assert.equal(tokens["--osio-link"], tokens["--osio-accent-text"]);
    assert.equal(tokens["--osio-graph-select"], tokens["--osio-accent"]);
  }
});

// A menu paints its panel with the raised colour and its highlighted row with
// the muted one: if the two meet, the highlight disappears.
test("a menu's highlighted row is a different colour from the menu", () => {
  for (const mode of MODES) {
    const tokens = resolved(mode);
    assert.notEqual(tokens["--osio-bg-elevated"], tokens["--osio-bg-muted"], mode);
  }
});

test("the committed stylesheet is what the seeds generate", () => {
  assert.equal(readAppFile(GENERATED_STYLESHEET), renderStylesheet());
});

// Two definitions of one token are settled by source order, silently: the
// hand-written value could win over the generated one, or lose, with no error.
test("global.css does not define a token the generator owns", () => {
  const generated = new Set([...Object.keys(modeTokens(defaultPalette, "light")), ...Object.keys(ALIASES)]);
  const css = readAppFile("src/app/styles/global.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const duplicated = new Set<string>();
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // The seven palettes that are still hand-written override on purpose.
    if (selector.includes("data-palette")) continue;
    for (const [, name] of body.matchAll(/(--osio-[a-z0-9-]+)\s*:/g)) {
      if (generated.has(name)) duplicated.add(name);
    }
  }
  assert.deepEqual([...duplicated], []);
});

test("the colours kept outside the stylesheet match the generated palette", () => {
  const light = resolved("light");
  const dark = resolved("dark");
  const html = readAppFile("index.html");
  assert.ok(html.includes(`content="${light["--osio-bg-page"]}" media="(prefers-color-scheme: light)"`), "light theme-color");
  assert.ok(html.includes(`content="${dark["--osio-bg-page"]}" media="(prefers-color-scheme: dark)"`), "dark theme-color");
  assert.ok(readAppFile("public/favicon.svg").includes(`fill="${light["--osio-accent"]}"`), "favicon");
  assert.ok(readAppFile("src/features/auth/ui/Portal.tsx").includes(`fill="${light["--osio-accent"]}"`), "sign-in brand mark");
  assert.deepEqual(WARM_PALETTE.swatches, [
    light["--osio-bg-page"],
    light["--osio-bg-surface"],
    light["--osio-accent"],
    light["--osio-update"],
    light["--osio-fg-default"],
  ]);
  assert.equal(WARM_PALETTE.id, defaultPalette.id);
  assert.equal(WARM_PALETTE.label, defaultPalette.label);
});
