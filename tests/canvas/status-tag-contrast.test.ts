// A status chip paints the family's ink (--color-<family>-text-tag) on a wash of that family's tint
// (--color-<family>-surface-muted or -medium). These tests resolve the committed bridge stylesheet
// against every generated palette and every shipped theme, so the chips are held to 4.5:1 as the
// browser paints them, not as a hand-kept list of token pairs remembers them.
//
// Caveat: the washes checked are the two the vendored options use (10% and 18%); a stored colour
// string asking for -surface-strong (28%) is not covered. Translucent mixes (accent-subtle over
// transparent) have no fixed backdrop and are skipped.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { resolvedTokens } from "../../scripts/tokens/aliases.mjs";
import { contrastRatio, mixHex } from "../../scripts/tokens/oklch.mjs";
import { MODES, PALETTES } from "../../scripts/tokens/palettes.mjs";
import { readAppFile } from "./tokens-css.ts";

type Tokens = Record<string, string>;

const FAMILIES = ["danger", "success", "warning", "amber", "orange", "purple", "violet", "indigo", "pink", "rose", "cyan", "teal", "emerald"];
const INKS = ["text-tag", "text-bold"];
const WASHES = ["surface-muted", "surface-medium"];

// The exact pair the vendored "In progress" option stores (statusDefaults.ts); the rule must match this and nothing wider.
const PROGRESS_CHIP_SELECTOR = 'html[data-theme] [class~="bg-accent-subtle"][class~="text-accent-text-bold"]';

const bridge = readAppFile("src/app/styles/database-bridge.generated.css");
const colourVars = new Map<string, string>();
for (const [, name, value] of bridge.matchAll(/^\s*(--color-[a-z0-9-]+):\s*(.+);$/gm)) colourVars.set(name, value);

/** A bridge value as #RRGGBB, or null for a translucent mix. */
function resolve(value: string, tokens: Tokens): string | null {
  const token = /^var\((--osio-[a-z0-9-]+)\)$/.exec(value);
  if (token) return tokens[token[1]];
  const mix = /^color-mix\(in srgb, var\((--osio-[a-z0-9-]+)\), var\((--osio-[a-z0-9-]+)\) (\d+)%\)$/.exec(value);
  return mix ? mixHex(tokens[mix[1]], tokens[mix[2]], Number(mix[3])) : null;
}

function chipFailures(tokens: Tokens): string[] {
  const failures: string[] = [];
  let checked = 0;
  for (const family of FAMILIES) {
    for (const ink of INKS) {
      for (const wash of WASHES) {
        const [inkName, washName] = [`--color-${family}-${ink}`, `--color-${family}-${wash}`];
        if (!colourVars.has(inkName) || !colourVars.has(washName)) continue; // the vendored theme does not declare every combination
        checked += 1;
        const [text, background] = [resolve(colourVars.get(inkName) ?? "", tokens), resolve(colourVars.get(washName) ?? "", tokens)];
        assert.ok(text && background, `${inkName} and ${washName} resolve`);
        const ratio = contrastRatio(text, background);
        if (ratio < 4.5) failures.push(`${family} ${ink} on ${wash}: ${ratio.toFixed(2)}`);
      }
    }
  }
  assert.ok(checked >= FAMILIES.length * 2, `only ${checked} family/ink/wash combinations exist in the bridge`);
  return failures;
}

const themesDir = new URL("../../src/shared/config/themes/", import.meta.url);
const shipped = readdirSync(themesDir)
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(readFileSync(new URL(file, themesDir), "utf8")) as { name: string; base: string; colors?: Record<string, string> });

// A theme overrides tokens one by one on top of its base mode's generated palette.
const themed = (theme: { base: string; colors?: Record<string, string> }): Tokens => ({
  ...resolvedTokens(PALETTES[0], theme.base),
  ...Object.fromEntries(Object.entries(theme.colors ?? {}).map(([key, value]) => [`--osio-${key}`, value])),
});

for (const palette of PALETTES) {
  for (const mode of MODES) {
    test(`palette "${palette.id}" ${mode}: every status chip reads at 4.5:1`, () => {
      assert.deepEqual(chipFailures(resolvedTokens(palette, mode)), []);
    });
  }
}

for (const theme of shipped) {
  test(`${theme.name}: every status chip reads at 4.5:1`, () => {
    assert.deepEqual(chipFailures(themed(theme)), []);
  });
}

// The chip must follow the tint, not the solid status fill a theme is free to recolour.
test("a status chip's ink is the tint foreground, not the theme's status fill", () => {
  for (const family of ["danger", "success", "warning"]) {
    for (const ink of INKS) assert.match(colourVars.get(`--color-${family}-${ink}`) ?? "", /^var\(--osio-block-tint-[a-z]+-fg\)$/);
  }
});

const progressBlock = bridge.slice(bridge.indexOf(PROGRESS_CHIP_SELECTOR)).split("}")[0];
const progressDeclaration = (property: string) => new RegExp(`(?:^|\\s)${property}:\\s*([^;]+);`).exec(progressBlock)?.[1] ?? "";

test("In Progress has its own purple chip, and it is not the accent", () => {
  assert.ok(bridge.includes(`${PROGRESS_CHIP_SELECTOR} {`), "the bridge carries the In Progress rule");
  assert.doesNotMatch(progressBlock, /--osio-accent/);
  assert.match(progressDeclaration("background-color"), /purple-bg/);
  assert.match(progressDeclaration("color"), /purple-fg/);
});

for (const palette of PALETTES) {
  for (const mode of MODES) {
    test(`palette "${palette.id}" ${mode}: the In Progress chip reads at 4.5:1`, () => {
      const tokens = resolvedTokens(palette, mode);
      const [text, background] = [resolve(progressDeclaration("color"), tokens), resolve(progressDeclaration("background-color"), tokens)];
      assert.ok(text && background);
      assert.ok(contrastRatio(text, background) >= 4.5, `${contrastRatio(text, background).toFixed(2)}`);
    });
  }
}
