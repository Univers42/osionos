/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   markengine.test.js                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:27:36 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 21:03:59 by dlesieur         ###   ########.fr       */
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

test("sanitizes unsafe href schemes in rendered html", () => {
  const result = compileMarkdownToHtml("[bad](javascript:alert(1))");

  assert.match(result.html, /href="#"/);
  assert.doesNotMatch(result.html, /javascript:/i);
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

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function createRandomDocument(random) {
  const lines = [];
  const blockCount = 3 + Math.floor(random() * 12);
  for (let block = 0; block < blockCount; block++) {
    const kind = pick(random, ["paragraph", "heading", "list", "quote"]);
    if (kind === "heading") {
      lines.push(`${"#".repeat(1 + Math.floor(random() * 3))} ${pick(random, ["Alpha", "Beta", "Gamma"])}`);
    } else if (kind === "list") {
      const count = 1 + Math.floor(random() * 4);
      for (let item = 0; item < count; item++) {
        lines.push(`- ${pick(random, ["one", "two", "three"])} ${Math.floor(random() * 10)}`);
      }
    } else if (kind === "quote") {
      lines.push(`> ${pick(random, ["quoted", "noted", "saved"])} ${Math.floor(random() * 10)}`);
    } else {
      const count = 1 + Math.floor(random() * 3);
      for (let line = 0; line < count; line++) {
        lines.push(`${pick(random, ["plain", "soft", "fast"])} ${Math.floor(random() * 100)} ${pick(random, ["text", "words", "inline *em*"])}`);
      }
    }
    if (block + 1 < blockCount && random() < 0.8) lines.push("");
  }
  return lines.join("\n");
}

function applyPatch(source, patch) {
  const lines = source.replaceAll(/\r\n?/g, "\n").split("\n");
  const fromLine = Math.max(0, Math.min(patch.fromLine, lines.length - 1));
  const toLine = Math.max(0, Math.min(patch.toLine, lines.length - 1));
  return [
    ...lines.slice(0, Math.min(fromLine, toLine)),
    ...patch.text.replaceAll(/\r\n?/g, "\n").split("\n"),
    ...lines.slice(Math.max(fromLine, toLine) + 1),
  ].join("\n");
}

test("incremental parsing matches a full parse for random patches", () => {
  const random = createRandom(0x5167a11d);
  for (let sample = 0; sample < 500; sample++) {
    const source = createRandomDocument(random);
    const previous = parseMarkdown(source, { documentVersion: sample });
    const lineCount = source.split("\n").length;
    const fromLine = Math.floor(random() * lineCount);
    const toLine = fromLine + Math.floor(random() * Math.min(3, lineCount - fromLine));
    const replacementLines = 1 + Math.floor(random() * 3);
    const text = Array.from(
      { length: replacementLines },
      () => `${pick(random, ["changed", "edited", "typed"])} ${Math.floor(random() * 100)} ${pick(random, ["text", "words", "line"])}`,
    ).join("\n");
    const patch = { fromLine, toLine, text };
    const next = incrementalParse(source, previous, patch);
    const full = parseMarkdown(applyPatch(source, patch), {
      documentVersion: previous.ast.version + 1,
    });

    assert.deepEqual(next.ast, full.ast);
    assert.deepEqual(next.blockIndex, full.blockIndex);
  }
});

function createLineIsolatedDocument(lineCount) {
  const lines = [];
  for (let index = 0; index < lineCount; index++) {
    lines.push(index % 2 === 0 ? `Paragraph ${index} with **inline** text.` : "");
  }
  return lines.join("\n");
}

test("incremental parsing matches a full parse for measured edit sizes", () => {
  const measuredSizes = [
    { lineCount: 1000, edits: 40 },
    { lineCount: 5000, edits: 25 },
    { lineCount: 10000, edits: 20 },
    { lineCount: 50000, edits: 10 },
    { lineCount: 200000, edits: 5 },
  ];
  let sample = 0;

  for (const { lineCount, edits } of measuredSizes) {
    const source = createLineIsolatedDocument(lineCount);
    const previous = parseMarkdown(source, { documentVersion: lineCount });
    const editableLines = Math.floor(lineCount / 2);

    for (let edit = 0; edit < edits; edit++) {
      const fromLine = ((edit * 997) % editableLines) * 2;
      const patch = {
        fromLine,
        toLine: fromLine,
        text: `Paragraph ${fromLine} with **inline** text.${edit}`,
      };
      const next = incrementalParse(source, previous, patch);
      const full = parseMarkdown(applyPatch(source, patch), {
        documentVersion: previous.ast.version + 1,
      });

      assert.deepEqual(next.ast, full.ast, `targeted sample ${sample}`);
      assert.deepEqual(next.blockIndex, full.blockIndex, `targeted sample ${sample}`);
      sample++;
    }
  }

  assert.equal(sample, 100);
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

test("covers block parser edge branches", () => {
  const result = parseMarkdown(
    [
      "####### not a heading",
      "##also not a heading",
      "",
      "***",
      "",
      "```",
      "plain fence",
      "```",
      "",
      "- [ ] open task",
      "- [X] done task",
    ].join("\n"),
  );

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.ast.children[0].kind, "paragraph");
  assert.equal(result.ast.children[1].kind, "thematic_break");
  assert.equal(result.ast.children[2].kind, "code_block");
  assert.equal(result.ast.children[2].language, null);
  assert.equal(result.ast.children[3].kind, "list");
  assert.equal(result.ast.children[3].items[0].checked, false);
  assert.equal(result.ast.children[3].items[1].checked, true);

  const paragraphStops = parseMarkdown(["alpha", "```", "code", "```", "bravo", "***"].join("\n"));
  assert.equal(paragraphStops.ast.children[0].kind, "paragraph");
  assert.equal(paragraphStops.ast.children[1].kind, "code_block");
  assert.equal(paragraphStops.ast.children[2].kind, "paragraph");
  assert.equal(paragraphStops.ast.children[3].kind, "thematic_break");

  const shortParagraph = parseMarkdown("x");
  assert.equal(shortParagraph.ast.children[0].kind, "paragraph");
});

test("covers inline parser delimiter fallback branches", () => {
  const nodes = parseInlines(
    "**strong** *em* **open *open [label] [empty]() [ok](https://example.com)",
  );

  assert.equal(nodes[0].kind, "strong");
  assert.equal(nodes[2].kind, "emphasis");
  assert.ok(nodes.some((node) => node.kind === "link"));
  assert.ok(
    nodes.some((node) => node.kind === "text" && node.value.includes("open *open")),
  );

  const malformed = parseInlines("[unterminated");
  assert.equal(malformed.length, 1);
  assert.ok(
    malformed[0].kind === "text" && malformed[0].value.includes("unterminated"),
  );

  const emptyHref = parseInlines("[empty]()");
  assert.equal(emptyHref.length, 1);
  assert.ok(emptyHref[0].kind === "text" && emptyHref[0].value.includes("empty"));
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
