// The slash menu's right-hand hint (shortcut, "esc") and "Suggested" tag. On the plain
// row it was --osio-fg-subtle: 4.56:1 on the dark panel, 4.44:1 to axe while the panel
// fades in (issue #331: #9a968b on #33302b, axe AA, flaky). A highlighted row is the
// hover fill, a 10% mix of --osio-fg-default over the raised panel (recipes.css
// --osio-menu-item-hover-bg); there --osio-fg-muted is only 3.93:1 in dark, so the hint
// switches to --osio-fg-default. Same sRGB blend as CSS color-mix(in srgb).

import assert from "node:assert/strict";
import test from "node:test";

import { resolvedTokens } from "../../scripts/tokens/aliases.mjs";
import { MODES, PALETTES } from "../../scripts/tokens/palettes.mjs";
import { contrastRatio, hexToRgb, rgbToHex } from "../../scripts/tokens/oklch.mjs";
import { SLASH_HINT_CLASS } from "@/features/slash-commands/model/slashHintStyle";

const AA_TEXT = 4.5;
// Headroom over AA for the open fade: 4.56 -> 4.44 (-0.12) was measured at ~98% opacity.
const FADE_HEADROOM = 0.2;
const HOVER_SHARE = 0.1;

function blend(foreground: string, share: number, background: string): string {
  const fg = hexToRgb(foreground);
  const bg = hexToRgb(background);
  const channel = (key: "r" | "g" | "b") => Math.round(fg[key] * share + bg[key] * (1 - share));
  return rgbToHex({ r: channel("r"), g: channel("g"), b: channel("b") });
}

test("the hint is muted on the plain row and --osio-fg-default on hover and aria-selected", () => {
  assert.match(SLASH_HINT_CLASS, /(^| )text-\[var\(--osio-fg-muted\)\]/);
  assert.match(SLASH_HINT_CLASS, /group-hover:text-\[var\(--osio-fg-default\)\]/);
  assert.match(SLASH_HINT_CLASS, /group-aria-selected:text-\[var\(--osio-fg-default\)\]/);
});

for (const palette of PALETTES) {
  for (const mode of MODES) {
    test(`palette "${palette.id}" ${mode}: the hint reaches 4.5:1 on the plain and the highlighted row`, () => {
      const tokens = resolvedTokens(palette, mode);
      const panel = tokens["--osio-bg-elevated"];
      const highlighted = blend(tokens["--osio-fg-default"], HOVER_SHARE, panel);
      const plain = contrastRatio(tokens["--osio-fg-muted"], panel);
      const onHighlight = contrastRatio(tokens["--osio-fg-default"], highlighted);
      assert.ok(plain >= AA_TEXT + FADE_HEADROOM, `plain row: muted on panel is ${plain.toFixed(2)}:1`);
      assert.ok(onHighlight >= AA_TEXT, `highlighted row: default on ${highlighted} is ${onHighlight.toFixed(2)}:1`);
    });
  }
}
