import assert from "node:assert/strict";
import test from "node:test";

import { terminalFontFamily } from "../../src/features/ide/model/terminalFont.ts";

const styleWith = (value: string) => ({ getPropertyValue: (name: string) => (name === "--osio-font-family-mono" ? value : "") });

test("the terminal gets the mono token's resolved font list", () => {
  assert.equal(terminalFontFamily(styleWith(' "JetBrains Mono", ui-monospace, monospace ')), '"JetBrains Mono", ui-monospace, monospace');
});

test("an unset token falls back to the generic monospace family", () => {
  assert.equal(terminalFontFamily(styleWith("")), "monospace");
});

test("a value a canvas cannot parse never reaches xterm", () => {
  assert.equal(terminalFontFamily(styleWith("var(--osio-font-family-code)")), "monospace");
});
