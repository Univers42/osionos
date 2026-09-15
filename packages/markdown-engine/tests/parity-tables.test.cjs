"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { loadMarkengine } = require("./support/loadMarkengine.cjs");

const E = loadMarkengine();
const first = (src) => E.parse(src)[0];
const tableFor = (sep) => first(`| a | b |\n${sep}\n| 1 | 2 |`);

test("table accepts every GFM delimiter form", () => {
  const separators = ["|---|---|", "| --- | --- |", ":--|--:", "|:--|--:|", "|:-:|:-:|", "|-|-|"];
  for (const sep of separators) {
    assert.equal(tableFor(sep).type, "table", `delimiter "${sep}" should start a table`);
  }
});

test("table parses column alignments from delimiter colons", () => {
  assert.deepEqual(tableFor("|:--|--:|").alignments, ["left", "right"]);
  assert.deepEqual(tableFor("|:-:|:-:|").alignments, ["center", "center"]);
  assert.deepEqual(tableFor("|---|---|").alignments, [null, null]);
});

test("non-delimiter rows never become tables", () => {
  assert.equal(first("| a | b |\nno dashes here").type, "paragraph");
  assert.equal(first("| a |\n|||").type, "paragraph");
  assert.equal(first("---").type, "thematic_break");
});

test("table cells parse inline content", () => {
  const table = tableFor("|---|---|");
  assert.equal(table.head.cells[0].children[0].value, "a");
  assert.equal(table.rows[0].cells[0].children[0].value, "1");
});

test("table renders semantic html with header and body cells", () => {
  const html = E.renderHtml(E.parse("| a | b |\n|:--|--:|\n| 1 | 2 |"));
  assert.match(html, /<table/);
  assert.match(html, /<th/);
  assert.match(html, /<td/);
});
