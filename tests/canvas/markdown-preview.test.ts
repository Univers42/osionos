import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Block } from "@/entities/block";
import { isMarkdownPreview } from "@/entities/block/model/markdownPreview";
import { CodeBlockReadOnly } from "@/entities/block/ui/CodeBlockReadOnly";
import { fileToPage, pageToFile } from "@/features/page-file/model/pageFileCodec";
import { ReadmeBlocks } from "@/widgets/profile-page/ReadmeBlocks";

// Markdown preview (ADR 0058 U4-2, U4-4, U3-7): a code block renders through the engine's
// HTML subset only when language is "markdown" AND codeView is "preview"; anything else is
// the escaped source it always was.

const SOURCE = [
  '<div align="center"><kbd>Ctrl</kbd> <script>alert(1)</script></div>',
  "",
  "![logo](https://example.com/logo.png)",
].join("\n");

const markdownBlock = (extra: Partial<Block> = {}): Block =>
  ({ id: "b1", type: "code", language: "markdown", content: SOURCE, ...extra }) as Block;

const html = (element: React.ReactElement): string => renderToStaticMarkup(element);
const readOnly = (block: Block): string => html(React.createElement(CodeBlockReadOnly, { block }));

test("U4-2 the flag must be explicit: absent or source is not a preview", () => {
  assert.equal(isMarkdownPreview(markdownBlock()), false);
  assert.equal(isMarkdownPreview(markdownBlock({ codeView: "source" })), false);
  assert.equal(isMarkdownPreview(markdownBlock({ codeView: "preview" })), true);
});

test("U4-2 only the markdown language previews; mermaid keeps its own default path", () => {
  assert.equal(isMarkdownPreview(markdownBlock({ language: "mermaid", codeView: "preview" })), false);
  assert.equal(isMarkdownPreview(markdownBlock({ language: "html", codeView: "preview" })), false);
});

test("U4-4 an old markdown block without the flag shows escaped source, no elements", () => {
  const markup = readOnly(markdownBlock());
  assert.match(markup, /&lt;div align=/);
  assert.doesNotMatch(markup, /<div align=|<kbd|<script|<img /);
});

test("U4-2 with codeView preview the content renders through the subset as elements", () => {
  const markup = readOnly(markdownBlock({ codeView: "preview" }));
  assert.match(markup, /<kbd>Ctrl<\/kbd>/);
  assert.match(markup, /<img /);
  assert.doesNotMatch(markup, /<script|alert\(1\)<\/|&lt;div align/);
});

test("U3-7 every remote image in the preview keeps the privacy attributes", () => {
  const content = "![a](https://example.com/a.png)\n\n<img src=\"https://example.com/b.png\" width=\"40\">";
  const markup = readOnly(markdownBlock({ codeView: "preview", content }));
  const images = markup.match(/<img [^>]*>/g) ?? [];
  assert.equal(images.length, 2);
  for (const image of images) {
    for (const policy of ['loading="lazy"', 'decoding="async"', 'referrerPolicy="no-referrer"']) {
      assert.ok(image.toLowerCase().includes(policy.toLowerCase()), `${policy} missing on ${image}`);
    }
    assert.doesNotMatch(image, /crossorigin|srcset/i, image);
  }
});

test("U4-3 the README goes through the same call site and renders the preview", () => {
  const readme = { pageId: "p1", blocks: [markdownBlock({ codeView: "preview" })] };
  const markup = html(React.createElement(ReadmeBlocks, { readme, record: null }));
  assert.match(markup, /<kbd>Ctrl<\/kbd>/);
  assert.doesNotMatch(markup, /<script/);
});

test("U4-2 the page-file round trip keeps codeView on a markdown block", () => {
  const page = { _id: "p", workspaceId: "w", title: "T", content: [markdownBlock({ codeView: "preview" })] };
  const back = fileToPage(pageToFile(page as never)).content;
  assert.equal(back[0].language, "markdown");
  assert.equal(back[0].codeView, "preview");
  assert.equal(back[0].content, SOURCE);
});
