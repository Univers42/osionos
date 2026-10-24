// A custom accent is `oklch(L C var(--osio-accent-hue))` with constant L and C,
// so the page can take any hue the slider reaches. This is the proof that every
// whole degree of the circle is readable over every palette's surfaces.

import assert from "node:assert/strict";
import test from "node:test";

import { oklchToHex } from "../../scripts/tokens/oklch.mjs";
import { customTokens, withAccent } from "../../scripts/tokens/accents.mjs";
import { contrastFailures } from "../../scripts/tokens/contrast.mjs";
import { MODES, PALETTES } from "../../scripts/tokens/palettes.mjs";

// A custom hue can be out of the sRGB gamut; Chromium paints it by clipping each channel (lightness moves),
// the other reading of CSS Color 4 drops chroma only. Both must pass, or the build is green over a real failure.
const GAMUT_MODELS = [
  ["clipped", undefined],
  ["chroma-reduced", oklchToHex],
] as const;

// The AAA palette keeps its own accent (accents.mjs), so no custom hue ever lands on it.
const takesAccents = (palette: { contrast?: string }) => palette.contrast !== "AAA";

for (const palette of PALETTES.filter(takesAccents)) {
  for (const mode of MODES) {
    for (const [model, toHex] of GAMUT_MODELS) {
      test(`all 360 custom hues pass over ${palette.id}/${mode} (${model})`, () => {
        const failures: string[] = [];
        for (let hue = 0; hue < 360; hue += 1) {
          const tokens = withAccent(palette, mode, customTokens(mode, hue, toHex));
          for (const { text, background, ratio, required } of contrastFailures(tokens)) {
            failures.push(`hue ${hue}: ${text} on ${background} is ${ratio}:1, needs ${required}:1`);
          }
        }
        assert.deepEqual(failures.slice(0, 5), []);
      });
    }
  }
}
