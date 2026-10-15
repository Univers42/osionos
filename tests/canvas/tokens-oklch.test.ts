// Every colour the app ships is derived from OKLCH seeds and written as hex
// (Monaco and the graph engine only parse hex). If this maths drifts, every
// palette drifts with it — so it is pinned to published reference values.

import assert from "node:assert/strict";
import test from "node:test";

import {
  contrastRatio,
  hexToOklch,
  hexToRgb,
  isInGamut,
  oklchToHex,
  relativeLuminance,
  rgbToHex,
} from "../../scripts/tokens/oklch.mjs";

const near = (actual: number, expected: number, tolerance: number, label: string) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: got ${actual}, want ${expected} ±${tolerance}`);

test("hex parses in 3- and 6-digit form, any case", () => {
  assert.deepEqual(hexToRgb("#AABBCC"), { r: 170, g: 187, b: 204 });
  assert.deepEqual(hexToRgb("#aabbcc"), { r: 170, g: 187, b: 204 });
  assert.deepEqual(hexToRgb("#abc"), { r: 170, g: 187, b: 204 });
  assert.deepEqual(hexToRgb("#000"), { r: 0, g: 0, b: 0 });
});

test("anything that is not a 3- or 6-digit hex colour is a TypeError", () => {
  for (const bad of ["aabbcc", "#12", "#GGGGGG", "#12345", "#1234567", "", "red", 123, null, undefined]) {
    assert.throws(() => hexToRgb(bad as string), TypeError, `accepted ${String(bad)}`);
  }
});

test("rgb writes as upper-case 6-digit hex, rounding and clamping each channel", () => {
  assert.equal(rgbToHex({ r: 170, g: 187, b: 204 }), "#AABBCC");
  assert.equal(rgbToHex({ r: 0, g: 0, b: 0 }), "#000000");
  assert.equal(rgbToHex({ r: 254.6, g: 0.4, b: 15 }), "#FF000F");
  assert.equal(rgbToHex({ r: 300, g: -20, b: 255 }), "#FF00FF");
});

test("hex to OKLCH matches the published values for the sRGB primaries", () => {
  const cases = [
    ["#FF0000", 0.62796, 0.25768, 29.234],
    ["#00FF00", 0.86644, 0.29483, 142.495],
    ["#0000FF", 0.45201, 0.31321, 264.052],
  ] as const;
  for (const [hex, l, c, h] of cases) {
    const got = hexToOklch(hex);
    near(got.l, l, 0.0005, `${hex} l`);
    near(got.c, c, 0.0005, `${hex} c`);
    near(got.h, h, 0.05, `${hex} h`);
  }
});

test("greys have no chroma, and their hue is reported as 0", () => {
  near(hexToOklch("#FFFFFF").l, 1, 0.0005, "white l");
  near(hexToOklch("#000000").l, 0, 0.0005, "black l");
  near(hexToOklch("#808080").l, 0.59987, 0.0005, "mid grey l");
  for (const grey of ["#FFFFFF", "#000000", "#808080", "#1A1A1A"]) {
    const { c, h } = hexToOklch(grey);
    assert.ok(c < 0.0002, `${grey} chroma ${c}`);
    assert.equal(h, 0, `${grey} hue`);
  }
});

test("hue is always in [0, 360)", () => {
  for (const hex of ["#FF0000", "#FF00FF", "#00FFFF", "#123456", "#FEDCBA", "#CC785C"]) {
    const { h } = hexToOklch(hex);
    assert.ok(h >= 0 && h < 360, `${hex} hue ${h}`);
  }
});

test("hex survives the trip through OKLCH unchanged", () => {
  const steps = [0, 51, 102, 153, 204, 255];
  for (const r of steps) for (const g of steps) for (const b of steps) {
    const hex = rgbToHex({ r, g, b });
    assert.equal(oklchToHex(hexToOklch(hex)), hex);
  }
  for (const hex of ["#FAF9F5", "#CC785C", "#2563EB", "#1A1A18", "#1B1A17", "#0D1117", "#E8A78F", "#8C877D"]) {
    assert.equal(oklchToHex(hexToOklch(hex)), hex);
  }
});

test("a colour is in gamut when sRGB can show it", () => {
  assert.equal(isInGamut(hexToOklch("#00FF00")), true);
  assert.equal(isInGamut(hexToOklch("#FFFFFF")), true);
  assert.equal(isInGamut(hexToOklch("#000000")), true);
  assert.equal(isInGamut({ l: 0.6, c: 0.1, h: 250 }), true);
  assert.equal(isInGamut({ l: 0.5, c: 0.4, h: 150 }), false);
  assert.equal(isInGamut({ l: 0.9, c: 0.3, h: 30 }), false);
});

test("an out-of-gamut colour is brought in by lowering chroma only", () => {
  const wanted = { l: 0.5, c: 0.4, h: 150 };
  const hex = oklchToHex(wanted);
  assert.match(hex, /^#[0-9A-F]{6}$/);
  const got = hexToOklch(hex);
  near(got.l, wanted.l, 0.02, "lightness kept");
  near(got.h, wanted.h, 3, "hue kept");
  assert.ok(got.c < wanted.c, "chroma lowered");
  assert.ok(got.c > 0.1, `chroma lowered no further than needed, got ${got.c}`);
});

test("lightness outside 0..1 gives black or white", () => {
  assert.equal(oklchToHex({ l: 1.2, c: 0.1, h: 40 }), "#FFFFFF");
  assert.equal(oklchToHex({ l: 1, c: 0, h: 0 }), "#FFFFFF");
  assert.equal(oklchToHex({ l: -0.1, c: 0.1, h: 40 }), "#000000");
  assert.equal(oklchToHex({ l: 0, c: 0, h: 0 }), "#000000");
});

test("relative luminance and contrast follow WCAG 2", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  near(relativeLuminance("#FFFFFF"), 1, 1e-9, "white luminance");
  near(contrastRatio("#000000", "#FFFFFF"), 21, 1e-9, "black on white");
  near(contrastRatio("#777777", "#FFFFFF"), 4.478, 0.002, "#777 on white");
  near(contrastRatio("#767676", "#FFFFFF"), 4.542, 0.002, "#767676 on white");
  assert.equal(contrastRatio("#FFFFFF", "#000000"), contrastRatio("#000000", "#FFFFFF"));
  assert.equal(contrastRatio("#CC785C", "#CC785C"), 1);
});
