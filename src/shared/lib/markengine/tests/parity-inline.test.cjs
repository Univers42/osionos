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

test("bare URL autolinks (on a trailing boundary) with a hostname label", () => {
  const nodes = E.parseInline("see https://a.io/x here");
  const link = nodes.find((node) => node.type === "link");
  assert.equal(link.href, "https://a.io/x");
  assert.equal(link.children[0].value, "a.io");
  // A bare URL still at the caret's end stays plain text (autolink "on space"),
  // so typing a URL isn't disrupted by an early collapse to the hostname.
  assert.ok(!E.parseInline("https://a.io").some((node) => node.type === "link"));
});

test("reversed link sugar (text)[url] parses to a link, scheme-less url -> https", () => {
  const [link] = E.parseInline("(hello)[www.linkedin.com/in/ada-lee]");
  assert.equal(link.type, "link");
  assert.equal(link.children[0].value, "hello");
  assert.equal(link.href, "https://www.linkedin.com/in/ada-lee");
});

test("standard [text](url) normalizes a scheme-less/www url to https", () => {
  const [link] = E.parseInline("[hello](www.linkedin.com/in/ada-lee)");
  assert.equal(link.type, "link");
  assert.equal(link.children[0].value, "hello");
  assert.equal(link.href, "https://www.linkedin.com/in/ada-lee");
});

test("bare www. url autolinks with a hostname label and https href", () => {
  const nodes = E.parseInline("www.linkedin.com/in/ada-lee ");
  const link = nodes.find((node) => node.type === "link");
  assert.equal(link.href, "https://www.linkedin.com/in/ada-lee");
  assert.equal(link.children[0].value, "www.linkedin.com");
});

test("a plain (parenthetical) with no trailing [url] stays text", () => {
  const nodes = E.parseInline("(just parens)");
  assert.ok(!nodes.some((node) => node.type === "link"));
  assert.equal(nodes.map((node) => node.value).join(""), "(just parens)");
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

test("bare-url live-render gate fires on www./scheme, not on prose", () => {
  // The editor's char-class gate omits `.`/`/`; this predicate is why a scheme-less
  // `www.foo.com` still autolinks while typing (Part A).
  assert.equal(E.containsBareUrlShape("www.foo.com "), true);
  assert.equal(E.containsBareUrlShape("visit https://foo.com/x now"), true);
  assert.equal(E.containsBareUrlShape("HTTPS://Foo.Com/x now"), true);
  // Ordinary prose with sentence punctuation / a ratio must NOT trigger a re-render.
  assert.equal(E.containsBareUrlShape("This ends here."), false);
  assert.equal(E.containsBareUrlShape("a ratio like 10/20"), false);
  assert.equal(E.containsBareUrlShape("plain example.com"), false);
});

test("inline image round-trips through parse -> render (http + data-uri)", () => {
  // http(s) src: sanitizeUrl passes it through unchanged.
  const httpMd = "![](https://a.io/x.png)";
  const [httpNode] = E.parseInline(httpMd);
  assert.equal(httpNode.type, "image");
  assert.equal(httpNode.src, "https://a.io/x.png");
  assert.match(E.parseInlineMarkdown(httpMd), /<img src="https:\/\/a\.io\/x\.png" alt=""/);

  // data:image/* src (an upload / SVG): sanitizeUrl drops non-http schemes, so the
  // inline image renderer must allow the image data-URI (Part C).
  const dataUri = "data:image/png;base64,iVBORw0KGgo=";
  const dataMd = `![](${dataUri})`;
  const [dataNode] = E.parseInline(dataMd);
  assert.equal(dataNode.type, "image");
  assert.equal(dataNode.src, dataUri);
  assert.ok(
    E.parseInlineMarkdown(dataMd).includes(`<img src="${dataUri}" alt=""`),
    "data-uri image must render inline",
  );
  // A javascript: pseudo-src is still blanked (not an image data-URI).
  assert.equal(E.parseInlineMarkdown("![](javascript:alert(1))").includes("<img"), false);
});

test("inline icon serialized as an svg data-uri image round-trips", () => {
  // A lucide icon inserted inline collapses to an <img> with a base64 svg data-URI
  // (paren-free, so `![]()` parsing is robust); it parses, renders, and re-parses stable.
  const svg = "<svg xmlns='http://www.w3.org/2000/svg'><path d='M4 4h16'/></svg>";
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const md = `![](${src})`;
  const [node] = E.parseInline(md);
  assert.equal(node.type, "image");
  assert.equal(node.src, src);
  assert.ok(E.parseInlineMarkdown(md).includes(`<img src="${src}" alt=""`), "svg data-uri renders");
  // Re-parsing the same source is stable (persists across save/reload).
  assert.deepEqual(E.parseInline(md).map((n) => n.type), ["image"]);
});
