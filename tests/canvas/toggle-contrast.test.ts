// An off switch is a control whose only visible boundary is its track: WCAG 1.4.11
// asks 3:1 against whatever it sits on. Settings rows sit on the surface colour,
// menus and popovers on the raised one.

import assert from "node:assert/strict";
import test from "node:test";

import { resolvedTokens } from "../../scripts/tokens/aliases.mjs";
import { MODES, PALETTES } from "../../scripts/tokens/palettes.mjs";
import { contrastRatio } from "../../scripts/tokens/oklch.mjs";
import { blocksOf, readAppFile } from "./tokens-css.ts";

const NON_TEXT_CONTRAST = 3;

const recipes = blocksOf(readAppFile("src/app/styles/recipes.css"), /^:root/);
const declared = (name: string) => [...recipes.values()].map((block) => block[name]).find(Boolean);

test("recipes.css and the kit's contract both declare the off-track token", () => {
  assert.match(declared("--osio-toggle-off-bg") ?? "", /^var\(--osio-[a-z-]+\)$/);
  assert.match(readAppFile("packages/osionos-ui/tokens.css"), /--osio-toggle-off-bg:/);
});

for (const palette of PALETTES) {
  for (const mode of MODES) {
    test(`palette "${palette.id}" ${mode}: the off track reaches 3:1 on the surface and the raised colour`, () => {
      const tokens = resolvedTokens(palette, mode);
      const [, target] = /^var\((--osio-[a-z-]+)\)$/.exec(declared("--osio-toggle-off-bg") ?? "") ?? [];
      const track = tokens[target];
      for (const background of ["--osio-bg-surface", "--osio-bg-elevated"]) {
        const ratio = contrastRatio(track, tokens[background]);
        assert.ok(ratio >= NON_TEXT_CONTRAST, `${target} on ${background} is ${ratio.toFixed(2)}:1`);
      }
    });
  }
}
