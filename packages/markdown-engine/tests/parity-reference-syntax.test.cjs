"use strict";

// The full Markdown-reference matrix: every emphasis combination (there are
// only 3 meaningful levels — 4+ runs nest, they never invent a 4th style),
// the extended-syntax inline forms, and the block-level additions.
// Dialect pins that deviate from stock CommonMark on purpose:
//   __x__ is UNDERLINE (the editor's only underline sugar), ___x___ is bold+italic.

const test = require("node:test");
const assert = require("node:assert");
const { loadMarkengine } = require("./support/loadMarkengine.cjs");

const E = loadMarkengine();

function canon(nodes) {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text": return n.value;
        case "bold": return `[b]${canon(n.children)}[/b]`;
        case "italic": return `[i]${canon(n.children)}[/i]`;
        case "bold_italic": return `[b][i]${canon(n.children)}[/i][/b]`;
        case "underline": return `[u]${canon(n.children)}[/u]`;
        case "strikethrough": return `[s]${canon(n.children)}[/s]`;
        case "highlight": return `[mark]${canon(n.children)}[/mark]`;
        case "subscript": return `[sub]${canon(n.children)}[/sub]`;
        case "superscript": return `[sup]${canon(n.children)}[/sup]`;
        case "kbd": return `[kbd]${canon(n.children)}[/kbd]`;
        case "spoiler": return `[sp]${canon(n.children)}[/sp]`;
        case "code": return `[c]${n.value}[/c]`;
        case "link": return `[a:${n.href}]${canon(n.children)}[/a]`;
        case "image": return `[img:${n.src}]`;
        case "emoji": return n.value;
        case "line_break": return "<LB>";
        default: return `<${n.type}>`;
      }
    })
    .join("");
}

const inline = (src) => canon(E.parseInline(src));

test("emphasis: the three meaningful levels, both delimiters", () => {
  assert.equal(inline("*i*"), "[i]i[/i]");
  assert.equal(inline("_i_"), "[i]i[/i]");
  assert.equal(inline("**b**"), "[b]b[/b]");
  assert.equal(inline("__u__"), "[u]u[/u]"); // dialect: __ is underline
  assert.equal(inline("***bi***"), "[b][i]bi[/i][/b]");
  assert.equal(inline("___bi___"), "[b][i]bi[/i][/b]");
});

test("emphasis: mixed-delimiter nesting in every order", () => {
  assert.equal(inline("**_x_**"), "[b][i]x[/i][/b]");
  assert.equal(inline("_**x**_"), "[i][b]x[/b][/i]");
  assert.equal(inline("*__x__*"), "[i][u]x[/u][/i]");
  assert.equal(inline("__*x*__"), "[u][i]x[/i][/u]");
});

test("emphasis: 4+ delimiter runs nest — no 4th style exists", () => {
  assert.equal(inline("****x****"), "[b][b]x[/b][/b]");
  assert.equal(inline("*****x*****"), "[b][b][i]x[/i][/b][/b]");
  assert.equal(inline("******x******"), "[b][b][b]x[/b][/b][/b]");
});

test("emphasis: a run can close in parts (CommonMark pairing)", () => {
  assert.equal(inline("***a** b*"), "[i][b]a[/b] b[/i]");
  assert.equal(inline("***a* b**"), "[b][i]a[/i] b[/b]");
  assert.equal(inline("**a***b*"), "[b]a[/b]*b*");
  assert.equal(inline("**a****b**"), "[b]a[/b]**b**");
});

test("emphasis: surplus opener marks stay OUTSIDE as literal text", () => {
  assert.equal(inline("***hello**"), "*[b]hello[/b]");
  assert.equal(inline("___hello__"), "_[u]hello[/u]");
});

test("emphasis: same-marker inner spans stay nested, not spliced", () => {
  assert.equal(inline("*a **b** c*"), "[i]a [b]b[/b] c[/i]");
  assert.equal(inline("*a *b* c*"), "[i]a [i]b[/i] c[/i]");
});

test("emphasis: word-internal rules — * works, _ stays literal", () => {
  assert.equal(inline("un*frigging*believable"), "un[i]frigging[/i]believable");
  assert.equal(inline("snake_case_name"), "snake_case_name");
  assert.equal(inline("a_b_c"), "a_b_c");
});

test("emphasis: unpaired and empty runs stay literal", () => {
  assert.equal(inline("****"), "****");
  assert.equal(inline("** **"), "** **");
});

test("code spans bind tighter than emphasis", () => {
  assert.equal(inline("`code *not em*`"), "[c]code *not em*[/c]");
  assert.equal(inline("*em `code*` still*"), "[i]em [c]code*[/c] still[/i]");
});

test("backslash escapes every ASCII punctuation character", () => {
  assert.equal(inline("\\*not\\*"), "*not*");
  assert.equal(inline("\\<literal\\>"), "<literal>");
  assert.equal(inline('\\"quote\\"'), '"quote"');
  assert.equal(inline("\\~x\\~"), "~x~");
  assert.equal(inline("\\^x\\^"), "^x^");
});

test("subscript ~x~ and superscript ^x^ — tight spans only", () => {
  assert.equal(inline("H~2~O"), "H[sub]2[/sub]O");
  assert.equal(inline("x^2^"), "x[sup]2[/sup]");
  assert.equal(inline("x ~ y"), "x ~ y"); // spaces keep prose literal
  assert.equal(inline("5 ^ 2"), "5 ^ 2");
  assert.equal(inline("~~strike~~"), "[s]strike[/s]"); // ~~ still wins
});

test("spoiler ||x|| parses to a spoiler span", () => {
  assert.equal(inline("||spoiler||"), "[sp]spoiler[/sp]");
});

test("inline HTML fallbacks map to the same nodes as their sugar", () => {
  assert.equal(inline("<sub>2</sub>"), "[sub]2[/sub]");
  assert.equal(inline("<sup>2</sup>"), "[sup]2[/sup]");
  assert.equal(inline("<kbd>Ctrl</kbd>"), "[kbd]Ctrl[/kbd]");
  assert.equal(inline("<mark>hi</mark>"), "[mark]hi[/mark]");
  assert.equal(inline("<u>u</u>"), "[u]u[/u]");
  assert.equal(inline("<ins>i</ins>"), "[u]i[/u]");
  assert.equal(inline("<b>b</b>"), "[b]b[/b]");
  assert.equal(inline("<em>e</em>"), "[i]e[/i]");
  assert.equal(inline("<del>d</del>"), "[s]d[/s]");
});

test("HTML comments are invisible, inline and block", () => {
  assert.equal(inline("a<!-- hidden -->b"), "ab");
  const blocks = E.parse("<!-- block\ncomment -->\npara");
  assert.deepEqual(blocks.map((b) => b.type), ["paragraph"]);
});

test("kbd renders as <kbd>, spoiler as a spoiler span", () => {
  assert.match(E.renderHtml(E.parse("press <kbd>Ctrl</kbd>")), /<kbd>Ctrl<\/kbd>/);
  assert.match(E.renderHtml(E.parse("a ||s|| b")), /data-inline-type="spoiler"/);
  assert.match(E.renderHtml(E.parse("H~2~O and x^2^")), /<sub>2<\/sub>.*<sup>2<\/sup>/);
});

test("reference links: full, collapsed, and image forms resolve", () => {
  const doc = [
    "See [docs][1] and [named][] and ![logo][img].",
    "",
    '[1]: https://a.io "T"',
    "[named]: https://b.io",
    "[img]: https://c.io/l.png",
    "[//]: # (a comment)",
  ].join("\n");
  const [para] = E.parse(doc);
  assert.equal(para.type, "paragraph");
  const kinds = para.children.map((n) => n.type);
  assert.deepEqual(kinds, ["text", "link", "text", "link", "text", "image", "text"]);
  const [, link1, , link2, , image] = para.children;
  assert.equal(link1.href, "https://a.io");
  assert.equal(link1.title, "T");
  assert.equal(link2.href, "https://b.io");
  assert.equal(image.src, "https://c.io/l.png");
  assert.equal(E.parse(doc).length, 1); // definition lines render nothing
});

test("inline [text](url) still beats a same-named reference", () => {
  const doc = "[docs](https://inline.io)\n\n[docs]: https://ref.io";
  const [para] = E.parse(doc);
  assert.equal(para.children[0].href, "https://inline.io");
});

test("an undefined reference stays literal text", () => {
  assert.equal(inline("[nope][missing]"), "[nope][missing]");
});

test("front matter parses only at the top and renders nothing", () => {
  const blocks = E.parse("---\ntitle: x\ntags: [a]\n---\n\n# Hi");
  assert.equal(blocks[0].type, "front_matter");
  assert.equal(blocks[0].value, "title: x\ntags: [a]");
  assert.equal(blocks[1].type, "heading");
  assert.doesNotMatch(E.renderHtml(blocks), /title: x/);
  // Without a closing fence the opener is still a thematic break.
  assert.equal(E.parse("---\nplain")[0].type, "thematic_break");
});

test("heading custom ids: {#custom-id} overrides the slug", () => {
  const [h] = E.parse("### My Heading {#custom-id}");
  assert.equal(h.id, "custom-id");
  assert.equal(canon(h.children), "My Heading");
});

test("definition lists parse and render as dl/dt/dd", () => {
  const [dl] = E.parse("Term\n: def one\n: def two");
  assert.equal(dl.type, "definition_list");
  assert.equal(dl.items.length, 1);
  assert.equal(canon(dl.items[0].term), "Term");
  assert.equal(dl.items[0].definitions.length, 2);
  const html = E.renderHtml([dl]);
  assert.match(html, /<dl[^>]*>[\s\S]*<dt>Term<\/dt>[\s\S]*<dd>def one<\/dd>/);
});

test("a 4-backtick fence shows a 3-backtick block verbatim", () => {
  const [code] = E.parse("````\n```\ninner\n```\n````");
  assert.equal(code.type, "code_block");
  assert.equal(code.value, "```\ninner\n```");
});

test("```math fences are display math, not code", () => {
  const [math] = E.parse("```math\nE=mc^2\n```");
  assert.equal(math.type, "math_block");
  assert.equal(math.value, "E=mc^2");
});

test("table cells honor the \\| escape", () => {
  const [table] = E.parse("| a \\| b | c |\n|---|---|\n| 1 | 2 |");
  assert.equal(table.type, "table");
  assert.equal(canon(table.head.cells[0].children), "a | b");
  assert.equal(table.head.cells.length, 2);
});

test("reference emoji shortcodes resolve (:joy: :rocket: :+1:)", () => {
  assert.equal(inline(":joy:"), "😂");
  assert.equal(inline(":rocket:"), "🚀");
  assert.equal(inline(":+1:"), "👍");
  assert.equal(inline(":not_a_thing:"), ":not_a_thing:");
});
