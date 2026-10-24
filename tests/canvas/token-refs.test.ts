// A component that reads a token nobody defines gets an empty value: no
// colour, no font, and no error anywhere. The guard finds those reads.

import assert from "node:assert/strict";
import test from "node:test";

import { collectSources, findUndefinedTokenRefs } from "../../scripts/check-token-refs.mjs";

const css = (text: string) => ({ path: "a.css", text });
const tsx = (text: string) => ({ path: "a.tsx", text });

test("a token read without a fallback must be defined somewhere", () => {
  const found = findUndefinedTokenRefs([
    css(":root { --osio-bg-page: #fff; }"),
    tsx('<div className="bg-[var(--osio-bg-page)] text-[var(--osio-fg-ghost)]" />'),
  ]);
  assert.deepEqual(found.map((ref) => ref.token), ["--osio-fg-ghost"]);
  assert.equal(found[0].path, "a.tsx");
  assert.equal(found[0].line, 1);
});

test("a read with a fallback is the author's own answer to a missing token", () => {
  assert.deepEqual(findUndefinedTokenRefs([css(".a { color: var(--osio-fg-ghost, black); }")]), []);
});

test("getPropertyValue reads count; a token set as an inline style key is defined", () => {
  const found = findUndefinedTokenRefs([
    tsx('const a = style.getPropertyValue("--osio-font-mono");'),
    tsx('<div style={{ "--osio-pane-zoom": zoom }}>{"var(--osio-pane-zoom)"}</div>'),
  ]);
  assert.deepEqual(found.map((ref) => ref.token), ["--osio-font-mono"]);
});

test("a token named only in a comment is neither defined nor read", () => {
  const found = findUndefinedTokenRefs([
    css("/* --osio-radius-card: 14 */ .a { border-radius: var(--osio-radius-card); }"),
    tsx("// uses var(--osio-not-real)\nexport const a = 1;"),
  ]);
  assert.deepEqual(found.map((ref) => ref.token), ["--osio-radius-card"]);
});

test("the app reads no undefined token", () => {
  const found = findUndefinedTokenRefs(collectSources(new URL("../../", import.meta.url).pathname));
  assert.deepEqual(found.map((ref) => `${ref.path}:${ref.line} ${ref.token}`), []);
});
