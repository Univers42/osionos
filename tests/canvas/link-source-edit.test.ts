/* ************************************************************************** */
/*  link-source-edit.test.ts — locate/rewrite inline [text](url) in source   */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  findLinks,
  removeLink,
  replaceLink,
} from "../../src/components/blocks/linkSourceEdit.ts";

test("findLinks: bracket links in order, empty href, and title; ignores images", () => {
  const src = "see [a](https://a.com) and [b]() then ![img](x.png) and [c](y \"T\")";
  const links = findLinks(src);
  assert.equal(links.length, 3);
  assert.deepEqual(
    links.map((l) => [l.text, l.href, l.title]),
    [["a", "https://a.com", undefined], ["b", "", undefined], ["c", "y", "T"]],
  );
});

test("replaceLink: rewrites the Nth link, leaving the rest untouched", () => {
  const src = "x [a](1) y [b]() z";
  assert.equal(replaceLink(src, 1, { text: "B", href: "https://b.com" }), "x [a](1) y [B](https://b.com) z");
  assert.equal(replaceLink(src, 0, { text: "a", href: "2" }), "x [a](2) y [b]() z");
  // out-of-range index is a no-op
  assert.equal(replaceLink(src, 9, { text: "z", href: "z" }), src);
  // blank text falls back to the href so the link never renders empty
  assert.equal(replaceLink("[old](u)", 0, { text: "", href: "https://h" }), "[https://h](https://h)");
});

test("removeLink: unlinks the Nth link to its visible text", () => {
  assert.equal(removeLink("x [a](1) y [b](2)", 0), "x a y [b](2)");
  assert.equal(removeLink("x [a](1) y [b](2)", 1), "x [a](1) y b");
});
