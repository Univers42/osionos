// Monaco takes literal colours and the custom accent is an oklch() token, so a
// value that is not already hex or rgb() goes through a 1x1 canvas probe. The
// browser's canvas is replaced by a fake that parses a fixed table, the way a
// canvas keeps its previous fillStyle when it is handed something invalid.

import assert from "node:assert/strict";
import test from "node:test";

import { createCssColorResolver } from "../../src/shared/lib/color/resolveCssColor.ts";
import { normalizeColor } from "../../src/features/ide/ui/editorPalette.ts";

const PIXELS: Record<string, [number, number, number, number]> = {
  "oklch(0.497 0.14 140)": [32, 120, 40, 255],
  "oklch(0.7 0.1 30 / 0.5)": [200, 120, 100, 128],
  "transparent": [0, 0, 0, 0],
  "#000000": [0, 0, 0, 255],
  "#ffffff": [255, 255, 255, 255],
};

function fakeContext() {
  const calls = { reads: 0 };
  let fill = "#000000";
  let pixel: [number, number, number, number] = [0, 0, 0, 255];
  const context = {
    get fillStyle() {
      return fill;
    },
    set fillStyle(value: string) {
      // An invalid colour is ignored, as in a real canvas.
      if (value in PIXELS) {
        fill = value;
        pixel = PIXELS[value];
      }
    },
    clearRect() {},
    fillRect() {},
    getImageData() {
      calls.reads += 1;
      return { data: Uint8ClampedArray.from(pixel) };
    },
  };
  return { context, calls };
}

test("a modern colour resolves to #RRGGBB", () => {
  const { context } = fakeContext();
  const resolve = createCssColorResolver(() => context);
  assert.equal(resolve("oklch(0.497 0.14 140)"), "#207828");
});

test("an invalid value, an unresolved var() and a transparent or translucent colour are null", () => {
  const { context } = fakeContext();
  const resolve = createCssColorResolver(() => context);
  assert.equal(resolve("var(--osio-accent)"), null);
  assert.equal(resolve("not a colour"), null);
  assert.equal(resolve("transparent"), null);
  assert.equal(resolve("oklch(0.7 0.1 30 / 0.5)"), null, "alpha is not flattened: the caller's own default applies");
  assert.equal(resolve("#000000"), "#000000", "a black that is really black is not mistaken for invalid");
});

test("each distinct value is probed once, and a miss is remembered too", () => {
  const { context, calls } = fakeContext();
  const resolve = createCssColorResolver(() => context);
  resolve("oklch(0.497 0.14 140)");
  resolve("oklch(0.497 0.14 140)");
  resolve("bogus");
  resolve("bogus");
  assert.equal(calls.reads, 1);
});

test("without a canvas (no document) nothing resolves", () => {
  assert.equal(createCssColorResolver(() => null)("oklch(0.5 0.1 10)"), null);
});

test("normalizeColor keeps hex and rgb() exact and leaves other values to the probe, which is absent in Node", () => {
  assert.equal(normalizeColor("#abc"), "#AABBCC");
  assert.equal(normalizeColor("rgb(1, 2, 3)"), "#010203");
  assert.equal(normalizeColor("oklch(0.497 0.14 140)"), null);
});
