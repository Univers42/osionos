"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadMarkengine } = require("./support/loadMarkengine.cjs");

const E = loadMarkengine();
const types = (src) => E.parseInline(src).map((node) => node.type);

test("emphasis variants parse to typed inline nodes", () => {
  assert.deepEqual(types("**b**"), ["bold"]);
  assert.deepEqual(types("_i_"), ["italic"]);
  assert.deepEqual(types("~~s~~"), ["strikethrough"]);
  assert.deepEqual(types("`c`"), ["code"]);
});

test("emphasis nests (bold inside italic) without flattening", () => {
  const [italic] = E.parseInline("*a **b** c*");
  assert.equal(italic.type, "italic");
  assert.deepEqual(italic.children.map((node) => node.type), ["text", "bold", "text"]);
  assert.equal(italic.children[1].children[0].value, "b");
});

test("links keep href + title; autolinks expose the url", () => {
  const [link] = E.parseInline('[t](https://a.io "T")');
  assert.equal(link.type, "link");
  assert.equal(link.href, "https://a.io");
  assert.equal(link.title, "T");
  const [auto] = E.parseInline("<https://a.io>");
  assert.equal(auto.type, "link");
  assert.equal(auto.href, "https://a.io");
});

test("images carry src + alt", () => {
  const [image] = E.parseInline("![alt](https://a.io/p.png)");
  assert.equal(image.type, "image");
  assert.equal(image.src, "https://a.io/p.png");
  assert.equal(image.alt, "alt");
});

test("inline code preserves special characters verbatim", () => {
  const [code] = E.parseInline("`a<b>&c`");
  assert.equal(code.type, "code");
  assert.equal(code.value, "a<b>&c");
});

test("rendered html escapes unsafe text and dangerous link schemes", () => {
  assert.match(E.renderHtml(E.parse("a<b>c")), /a&lt;b&gt;c/);
  assert.doesNotMatch(E.renderHtml(E.parse("[x](javascript:alert(1))")), /href="javascript:/);
});
