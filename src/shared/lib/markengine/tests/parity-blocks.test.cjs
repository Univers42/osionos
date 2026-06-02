"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadMarkengine } = require("./support/loadMarkengine.cjs");

const E = loadMarkengine();
const first = (src) => E.parse(src)[0];

test("nested unordered lists preserve every indent level", () => {
  const list = first("- a\n  - b\n    - c");
  const level2 = list.children[0].children[1];
  const level3 = level2.children[0].children[1];
  assert.equal(list.type, "unordered_list");
  assert.equal(level2.type, "unordered_list");
  assert.equal(level3.type, "unordered_list");
});

test("ordered lists may nest unordered children", () => {
  const list = first("1. one\n   - sub");
  assert.equal(list.type, "ordered_list");
  assert.equal(list.children[0].children[1].type, "unordered_list");
});

test("task items carry their checked state", () => {
  const list = first("- [ ] a\n- [x] b\n- [X] c");
  assert.equal(list.type, "task_list");
  assert.deepEqual(list.children.map((item) => item.checked), [false, true, true]);
});

test("headings span levels 1-6 and slugify ids", () => {
  for (let level = 1; level <= 6; level++) {
    const node = first(`${"#".repeat(level)} Heading`);
    assert.equal(node.type, "heading");
    assert.equal(node.level, level);
  }
  assert.equal(first("## Hello World").id, "hello-world");
});

test("fenced code keeps language and body", () => {
  const node = first("```js\nx = 1\n```");
  assert.equal(node.type, "code_block");
  assert.equal(node.lang, "js");
  assert.equal(node.value, "x = 1");
});

test("blockquotes wrap block-level children", () => {
  const node = first("> quoted");
  assert.equal(node.type, "blockquote");
  assert.equal(node.children[0].type, "paragraph");
});

test("CRLF and trailing blank lines normalize cleanly", () => {
  const blocks = E.parse("# H\r\n\r\n- x\r\n");
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[1].type, "unordered_list");
});
