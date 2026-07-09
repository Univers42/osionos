/* ************************************************************************** */
/*  inline-clear-math.test.ts — clear_format + toggle_math inline commands    */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { applyInlineFormatting } from "../../src/shared/lib/markengine/inlineFormatting.ts";

// Selection offsets are in rendered-text space (what the caret sees).
const sel = (start: number, end: number) => ({ start, end });

test("clear_format: strips every inline mark back to plain text", () => {
  assert.equal(applyInlineFormatting("**bold**", sel(0, 4), { type: "clear_format" }), "bold");
  assert.equal(applyInlineFormatting("*a* **b**", sel(0, 3), { type: "clear_format" }), "a b");
  // already plain → unchanged
  assert.equal(applyInlineFormatting("plain", sel(0, 5), { type: "clear_format" }), "plain");
});

test("toggle_math: wraps selection as $…$, and unwraps an existing equation", () => {
  assert.equal(applyInlineFormatting("hello", sel(0, 5), { type: "toggle_math" }), "$hello$");
  assert.equal(applyInlineFormatting("$hello$", sel(0, 5), { type: "toggle_math" }), "hello");
});
