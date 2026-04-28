/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markengine.test.js                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:21:52 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:21:53 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";

import {
  compileMarkdownToHtml,
  compileMarkdownToSourceView,
  incrementalParse,
  parseInlines,
  parseMarkdown,
  renderSource,
  renderHtml,
  resolveModeState,
} from "../dist/markdown.js";

test("parses a document AST with core block types", () => {
  const source = [
    "# Title",
    "",
    "A *fast* **AST** engine.",
    "",
    "> quoted line",
    "",
    "- one",
    "- two",
    "",
    "```ts",
    'console.log("x");',
    "```",
    "",
    "---",
  ].join("\n");

  const result = parseMarkdown(source, { documentVersion: 1 });
  assert.equal(result.ast.kind, "document");
  assert.equal(result.ast.version, 1);
  assert.equal(result.ast.children.length, 6);

  const [heading, paragraph, blockquote, list, codeBlock, breakNode] =
    result.ast.children;
  assert.equal(heading.kind, "heading");
  assert.equal(heading.depth, 1);
  assert.equal(paragraph.kind, "paragraph");
  assert.equal(blockquote.kind, "blockquote");
  assert.equal(list.kind, "list");
  assert.equal(codeBlock.kind, "code_block");
  assert.equal(breakNode.kind, "thematic_break");
  assert.equal(result.blockIndex.length, 6);
});

test("renders semantic html for core nodes", () => {
  const source = "# Title\n\nA *fast* **AST** engine.";
  const result = compileMarkdownToHtml(source);

  assert.match(result.html, /<h1[^>]*data-node-id="[^"]+"[^>]*>Title<\/h1>/);
  assert.match(result.html, /<em[^>]*>fast<\/em>/);
  assert.match(result.html, /<strong[^>]*>AST<\/strong>/);
  assert.match(result.html, /<p[^>]*>A /);
});

test("parses inline links and code spans", () => {
  const nodes = parseInlines("See [docs](https://example.com) and `code`.");

  assert.equal(nodes.length, 5);
  assert.equal(nodes[0].kind, "text");
  assert.equal(nodes[1].kind, "link");
  assert.equal(nodes[1].href, "https://example.com");
  assert.equal(nodes[2].kind, "text");
  assert.equal(nodes[3].kind, "code_span");
  assert.equal(nodes[3].value, "code");
  assert.equal(nodes[4].kind, "text");
});

test("supports incremental reparsing", () => {
  const previousText = "# Title\n\nA *fast* **AST** engine.";
  const previousResult = parseMarkdown(previousText, { documentVersion: 1 });

  const next = incrementalParse(previousText, previousResult, {
    fromLine: 2,
    toLine: 2,
    text: "A *very fast* **AST** engine.",
  });

  assert.equal(next.ast.children.length, 2);
  assert.equal(next.changedNodeIds.length, 1);
  assert.ok(next.changedNodeIds[0]);
  assert.match(renderHtml(next.ast), /very fast/);
});

test("reports a diagnostic for an unterminated code fence", () => {
  const result = parseMarkdown("```ts\nconsole.log('x');\n");

  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].code, "UNTERMINATED_FENCE");
  assert.equal(result.diagnostics[0].severity, "warning");
});

test("clamps invalid incremental patch ranges and reports diagnostics", () => {
  const previousText = "# Title\n\nBody";
  const previousResult = parseMarkdown(previousText, { documentVersion: 1 });

  const next = incrementalParse(previousText, previousResult, {
    fromLine: 8,
    toLine: 2,
    text: "Replacement",
  });

  assert.ok(
    next.diagnostics.some(
      (diagnostic) => diagnostic.code === "PATCH_RANGE_SWAPPED",
    ),
  );
  assert.ok(
    next.diagnostics.some(
      (diagnostic) => diagnostic.code === "PATCH_RANGE_CLAMPED",
    ),
  );
});

test("parses ordered and unordered list shapes", () => {
  const result = parseMarkdown(["1. one", "2. two", "", "- three"].join("\n"));

  assert.equal(result.ast.children.length, 2);
  assert.equal(result.ast.children[0].kind, "list");
  assert.equal(result.ast.children[0].ordered, true);
  assert.equal(result.ast.children[0].items.length, 2);
  assert.equal(result.ast.children[1].kind, "list");
  assert.equal(result.ast.children[1].ordered, false);
});

test("renders markdown source syntax view", () => {
  const html = renderSource(
    "# Title\n\n- [x] done and [docs](https://example.com)",
  );

  assert.match(html, /md-source-view/);
  assert.match(html, /md-src-marker/);
  assert.match(html, /md-src-task/);
  assert.match(html, /md-src-link-url/);
});

test("compiles markdown to source view with ast", () => {
  const result = compileMarkdownToSourceView("## Section\n\nParagraph");

  assert.match(result.html, /md-source-view/);
  assert.equal(result.ast.kind, "document");
  assert.equal(result.ast.children.length, 2);
});

test("exposes explicit mode state classes through resolver", () => {
  assert.equal(resolveModeState("source").name, "source");
  assert.equal(resolveModeState("live-preview").name, "live-preview");
  assert.equal(resolveModeState("reading").name, "reading");
});

test("renders source mode with visible markdown symbols", () => {
  const html = renderSource("# Title\n\n**Bold**", { mode: "source" });

  assert.match(html, /md-src-marker/);
  assert.doesNotMatch(html, /md-src-symbol-hidden/);
  assert.match(html, /data-mode="source"/);
});

test("renders live preview mode with hidden markdown symbols", () => {
  const html = renderSource("# Title\n\n**Bold**", {
    mode: "live-preview",
  });

  assert.match(html, /md-src-marker/);
  assert.match(html, /md-src-symbol-hidden/);
  assert.match(html, /data-mode="live-preview"/);
});

test("tags rendered html blocks with mode state", () => {
  const source = "# Title\n\nParagraph";
  const result = compileMarkdownToHtml(source, {}, { mode: "reading" });

  assert.match(result.html, /data-block-state="reading"/);
});

test("mixes source, live-preview, and reading states per html block", () => {
  const source = "# Title\n\nParagraph\n\n> Quote";
  const result = compileMarkdownToHtml(
    source,
    {},
    {
      mode: "reading",
      blockModes: ["source", "live-preview", "reading"],
    },
  );

  assert.match(result.html, /data-block-state="source"/);
  assert.match(result.html, /data-block-state="live-preview"/);
  assert.match(result.html, /data-block-state="reading"/);
});

test("mixes source view states per line", () => {
  const html = renderSource("# Title\n- task\nParagraph", {
    mode: "reading",
    lineModes: ["source", "live-preview", "reading"],
  });

  assert.match(html, /data-block-state="source"/);
  assert.match(html, /data-block-state="live-preview"/);
  assert.match(html, /data-block-state="reading"/);
  assert.match(html, /md-src-symbol-hidden/);
});
