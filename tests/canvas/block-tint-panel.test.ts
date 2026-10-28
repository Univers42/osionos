// A text block given a background colour reads as a panel: the colour needs an
// inset so the glyphs do not touch its edges. Blocks that draw their own box
// (callout, equation, media) keep their geometry and get no extra class.

import assert from "node:assert/strict";
import test from "node:test";

import {
  TINT_PANEL_CLASS,
  getBlockSurfaceClass,
  getBlockSurfaceStyle,
  resolveBlockTint,
} from "../../src/features/block-editor/model/blockColors.ts";

const YELLOW = "var(--osio-block-tint-yellow-bg)";

test("tinted text blocks get the panel class", () => {
  for (const type of ["paragraph", "heading_1", "heading_3", "bulleted_list", "to_do", "toggle", "quote"] as const) {
    assert.equal(getBlockSurfaceClass({ type, backgroundColor: YELLOW }), TINT_PANEL_CLASS, type);
  }
});

test("untinted blocks get no class", () => {
  assert.equal(getBlockSurfaceClass({ type: "paragraph" }), "");
  assert.equal(getBlockSurfaceClass({ type: "heading_1", backgroundColor: "" }), "");
});

test("blocks that draw their own box keep it", () => {
  for (const type of ["callout", "equation", "image", "code", "database_inline"] as const) {
    assert.equal(getBlockSurfaceClass({ type, backgroundColor: YELLOW }), "", type);
  }
});

test("/background <name> resolves to the faded block tint, not a swatch hex", () => {
  assert.equal(resolveBlockTint("red"), "var(--osio-block-tint-red-bg)");
  assert.equal(resolveBlockTint(" Grey "), "var(--osio-block-tint-gray-bg)");
  assert.equal(resolveBlockTint("blu"), "var(--osio-block-tint-blue-bg)");
  assert.equal(resolveBlockTint("teal"), undefined);
  assert.equal(resolveBlockTint(""), undefined);
});

test("a raw hex background on a text panel is faded into the page and keeps the default text", () => {
  const style = getBlockSurfaceStyle({ type: "heading_2", backgroundColor: "#ef4444" });
  assert.equal(style?.backgroundColor, "color-mix(in oklab, #ef4444 14%, var(--osio-bg-page))");
  assert.equal(style?.color, undefined);
});

test("a tint token, a chosen text colour and non-panel blocks are left as stored", () => {
  assert.deepEqual(getBlockSurfaceStyle({ type: "paragraph", backgroundColor: YELLOW }), { backgroundColor: YELLOW });
  assert.equal(getBlockSurfaceStyle({ type: "paragraph", backgroundColor: "#ef4444", textColor: "#111111" })?.color, "#111111");
  assert.equal(getBlockSurfaceStyle({ type: "callout", backgroundColor: "#ef4444" })?.backgroundColor, "#ef4444");
});
