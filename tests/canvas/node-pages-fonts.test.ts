// The node serves only /editor/assets/* and /terminal/assets/*, so a root-absolute /fonts/ url in
// a page's CSS 404s on 127.0.0.1:4100 (osionos#291). Source-level check: the build copies whatever
// a relative url() names into assets/.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");
const faceBlocks = (css: string) => css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
const families = (css: string) => faceBlocks(css).map((block) => /font-family:\s*"([^"]+)"/.exec(block)?.[1]);
const FONT_URL = /url\("([^"]+\.woff2)"\)/g;

test("global.css, shared by the node's editor page, names no root-absolute font", () => {
  assert.equal(/url\(\s*["']?\/fonts\//.test(read("../../src/app/styles/global.css")), false);
});

test("the editor page declares its faces by relative woff2 urls that exist", () => {
  const css = read("../../src/editor-client/editor.css");
  const urls = [...css.matchAll(FONT_URL)].map((match) => match[1]);
  assert.ok(urls.length >= 3, "the editor page declares no faces");
  for (const url of urls) {
    assert.ok(url.startsWith("../"), `${url} is not relative`);
    assert.ok(existsSync(new URL(url, new URL("../../src/editor-client/editor.css", import.meta.url))), `${url} does not exist`);
  }
});

test("every face the editor page declares is one the app declares too (JetBrains Mono, Inter, Newsreader)", () => {
  const app = families(read("../../src/app/styles/fonts.css"));
  const editor = families(read("../../src/editor-client/editor.css"));
  assert.deepEqual([...editor].sort(), ["Inter Variable", "JetBrains Mono", "Newsreader"]);
  for (const family of editor) assert.ok(app.includes(family), `${family} is not an app face`);
});

test("the terminal page declares no web font and no /fonts/ url", () => {
  const css = read("../../src/terminal-client/terminal.css");
  assert.equal(faceBlocks(css).length, 0);
  assert.equal(css.includes("/fonts/"), false);
});
