const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compileMarkdownToHtml,
  incrementalParse,
  parseInlines,
  parseMarkdown,
  renderHtml,
} = require("../dist/markdown.js");

test("parses blocks into an AST", () => {
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
  assert.ok(Array.isArray(result.ast));
  assert.equal(result.ast.length, 6);

  const [heading, paragraph, blockquote, list, codeBlock, breakNode] =
    result.ast;
  assert.equal(heading.type, "heading");
  assert.equal(heading.level, 1);
  assert.equal(paragraph.type, "paragraph");
  assert.equal(blockquote.type, "blockquote");
  assert.equal(list.type, "unordered_list");
  assert.equal(codeBlock.type, "code_block");
  assert.equal(breakNode.type, "thematic_break");
});

test("renders semantic html for inline and block nodes", () => {
  const source = "# Title\n\nA *fast* **AST** engine.";
  const result = compileMarkdownToHtml(source);

  assert.match(result.html, /<h1[^>]*>Title<\/h1>/);
  assert.match(result.html, /<em[^>]*>fast<\/em>/);
  assert.match(result.html, /<strong[^>]*>AST<\/strong>/);
  assert.match(result.html, /<p[^>]*>A /);
});

test("parses inline links and code spans", () => {
  const nodes = parseInlines("See [docs](https://example.com) and `code`.");

  assert.equal(nodes.length, 5);
  assert.equal(nodes[0].type, "text");
  assert.equal(nodes[1].type, "link");
  assert.equal(nodes[1].href, "https://example.com");
  assert.equal(nodes[2].type, "text");
  assert.equal(nodes[3].type, "code");
  assert.equal(nodes[3].value, "code");
  assert.equal(nodes[4].type, "text");
});

test("supports incremental reparsing", () => {
  const previousText = "# Title\n\nA *fast* **AST** engine.";
  const previousResult = parseMarkdown(previousText, { documentVersion: 1 });

  const next = incrementalParse(previousText, previousResult, {
    fromLine: 2,
    toLine: 2,
    text: "A *very fast* **AST** engine.",
  });

  assert.equal(next.ast.length, 2);
  assert.equal(next.changedNodeIds.length, 1);
  assert.ok(next.changedNodeIds[0]);
  assert.match(renderHtml(next.ast), /very fast/);
});

test("parses toggle blocks with nested content", () => {
  const source = [
    "> [>] Main toggle",
    "\t## Nested heading",
    "\t- first",
    "\t- second",
    "",
    "After",
  ].join("\n");

  const result = parseMarkdown(source);
  assert.equal(result.ast.length, 2);

  const toggle = result.ast[0];
  assert.equal(toggle.type, "toggle");
  assert.equal(toggle.children.length, 2);
  assert.equal(toggle.children[0].type, "heading");
  assert.equal(toggle.children[1].type, "unordered_list");

  const html = renderHtml(result.ast);
  assert.match(html, /<details>/);
  assert.match(html, /<summary>Main toggle<\/summary>/);
  assert.match(html, /<h2[^>]*>Nested heading<\/h2>/);
});

test("parses multiple nested list indentation levels", () => {
  const source = [
    "1. root",
    "  - level 2",
    "    - level 3",
    "  2. nested ordered",
    "    1. level 3 ordered",
  ].join("\n");

  const result = parseMarkdown(source);
  assert.equal(result.ast.length, 1);

  const ordered = result.ast[0];
  assert.equal(ordered.type, "ordered_list");
  assert.equal(ordered.children.length, 1);

  const rootItem = ordered.children[0];
  const nestedUnordered = rootItem.children.find(
    (node) => node.type === "unordered_list",
  );
  const nestedOrdered = rootItem.children.find(
    (node) => node.type === "ordered_list",
  );

  assert.ok(nestedUnordered);
  assert.ok(nestedOrdered);

  const nestedLevelTwoItem = nestedUnordered.children[0];
  const nestedLevelThree = nestedLevelTwoItem.children.find(
    (node) => node.type === "unordered_list",
  );
  assert.ok(nestedLevelThree);
});

test("keeps very deep unordered list indentation instead of flattening", () => {
  const source = [
    "- 1",
    "    - s",
    "                    - qalskf",
    "                            - asdfk",
    "                                   - askf",
    "                                          - alskfadsf",
    "                                            - alsdfkj",
  ].join("\n");

  const result = parseMarkdown(source);
  assert.equal(result.ast.length, 1);
  assert.equal(result.ast[0].type, "unordered_list");

  let cursor = result.ast[0];
  let depth = 0;
  while (true) {
    const firstItem = cursor.children[0];
    const nested = firstItem.children.find((n) => n.type === "unordered_list");
    if (!nested) break;
    depth += 1;
    cursor = nested;
  }

  assert.equal(depth, 6);

  const leafItem = cursor.children[0];
  const leafParagraph = leafItem.children.find((n) => n.type === "paragraph");
  assert.ok(leafParagraph);
  const leafText = leafParagraph.children
    .map((n) => (n.type === "text" ? n.value : ""))
    .join("");
  assert.match(leafText, /alsdfkj/);
});

test("interprets inline <br> tags as line breaks", () => {
  const nodes = parseInlines("alpha<br>beta<br/>gamma");
  const breakCount = nodes.filter((n) => n.type === "line_break").length;
  assert.equal(breakCount, 2);

  const rendered = compileMarkdownToHtml("alpha<br>beta").html;
  assert.match(rendered, /alpha<br\s*\/>beta/);
});

test("parses task lists as task_list blocks", () => {
  const source = ["- [ ] todo", "  - [x] done"].join("\n");
  const result = parseMarkdown(source);

  assert.equal(result.ast.length, 1);
  assert.equal(result.ast[0].type, "task_list");
  assert.equal(result.ast[0].children.length, 1);

  const firstTask = result.ast[0].children[0];
  const nested = firstTask.children.find((n) => n.type === "task_list");
  assert.ok(nested);
});

test("renders todo text inline with checkbox", () => {
  const html = compileMarkdownToHtml("- [ ] buy milk").html;
  assert.match(
    html,
    /<li class="md-task-item"><input type="checkbox" disabled \/>buy milk<\/li>/,
  );
  assert.doesNotMatch(html, /<li class="md-task-item">[\s\S]*<p>buy milk<\/p>/);
});
