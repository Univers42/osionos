// #239: relative .md links between the files of an imported zip become page links.

import assert from "node:assert/strict";
import test from "node:test";

import { archivePathOf, linkImportedPages } from "../../src/features/settings/import/relativeLinks.ts";

const pages = new Map([
  ["guide/setup.md", "p-setup"],
  ["README.md", "p-readme"],
  ["guide/My Notes.md", "p-notes"],
]);

test("resolves ./, ../, fragments, queries and percent-encoding inside the archive", () => {
  assert.equal(archivePathOf(["guide"], "setup.md"), "guide/setup.md");
  assert.equal(archivePathOf(["guide"], "./setup.md#run"), "guide/setup.md");
  assert.equal(archivePathOf(["guide", "deep"], "../../README.md?x=1"), "README.md");
  assert.equal(archivePathOf(["guide"], "My%20Notes.md"), "guide/My Notes.md");
});

test("leaves the archive alone: URLs, absolute paths, anchors, escapes above the root", () => {
  for (const href of ["https://x.y/a.md", "mailto:a@b.c", "/etc/a.md", "#top", "../../a.md", "%E0%A4%A.md"]) {
    assert.equal(archivePathOf(["guide"], href), null, href);
  }
});

test("rewrites only links whose target was imported", () => {
  const markdown = "See [Setup](setup.md#run), [Home](../README.md), [Web](https://x.y) and [Gone](missing.md).";
  assert.equal(
    linkImportedPages(markdown, ["guide"], pages),
    "See [[page:p-setup]], [[page:p-readme]], [Web](https://x.y) and [Gone](missing.md).",
  );
});

test("keeps images, titles and angle-bracket targets in mind", () => {
  assert.equal(linkImportedPages("![shot](setup.md)", ["guide"], pages), "![shot](setup.md)");
  assert.equal(linkImportedPages('[S](setup.md "the setup")', ["guide"], pages), "[[page:p-setup]]");
  assert.equal(linkImportedPages("[N](<My%20Notes.md>)", ["guide"], pages), "[[page:p-notes]]");
});
