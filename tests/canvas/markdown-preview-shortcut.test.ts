import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ariaShortcutsInclude } from "@/features/automations/model/combo";
import { joinFrontMatter } from "@/features/page-file/model/frontMatter";
import { PREVIEW_MAX_CHARS, parsePreviewDocument, type ImagePolicy } from "@/features/ide/model/previewDocument";
import {
  PREVIEW_TOGGLE_ARIA,
  choosePreviewMode,
  isMacPlatform,
  isPreviewToggleKey,
  toggledPreviewView,
  type PreviewKeyEvent,
} from "@/features/ide/model/previewKeys";
import { MarkdownDocumentView } from "@/features/ide/ui/MarkdownDocumentView";
import { MarkdownPreviewSplit } from "@/features/ide/ui/MarkdownPreviewSplit";

const press = (overrides: Partial<PreviewKeyEvent>): PreviewKeyEvent => ({
  key: "V", ctrlKey: false, metaKey: false, shiftKey: true, altKey: false,
  repeat: false, isComposing: false, keyCode: 86, ...overrides,
});

// The worker's answer, rendered by the view the app and the editor page share.
const render = (source: string, images: ImagePolicy) => renderToStaticMarkup(React.createElement(MarkdownDocumentView, {
  state: { kind: "ready", document: parsePreviewDocument(source, images) },
}));

const attributeValues = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, "g"))].map((match) => match[1]);

test("Ctrl+Shift+V toggles off a Mac, Cmd+Shift+V on one, and nothing else does (EP10)", () => {
  const table: Array<[string, Partial<PreviewKeyEvent>, boolean, boolean]> = [
    ["ctrl+shift+V", { ctrlKey: true }, false, true],
    ["ctrl+shift+v (caps lock)", { ctrlKey: true, key: "v" }, false, true],
    ["meta+shift+V off a Mac", { metaKey: true }, false, false],
    ["cmd+shift+V on a Mac", { metaKey: true }, true, true],
    ["ctrl+shift+V on a Mac", { ctrlKey: true }, true, false],
    ["ctrl+V, no shift", { ctrlKey: true, shiftKey: false, key: "v" }, false, false],
    ["ctrl+alt+shift+V", { ctrlKey: true, altKey: true }, false, false],
    ["ctrl+meta+shift+V", { ctrlKey: true, metaKey: true }, false, false],
    ["shift+V alone", {}, false, false],
    ["during IME composition", { ctrlKey: true, isComposing: true }, false, false],
    ["Safari IME keyCode 229", { ctrlKey: true, keyCode: 229 }, false, false],
    ["key repeat", { ctrlKey: true, repeat: true }, false, false],
    ["ctrl+shift+B", { ctrlKey: true, key: "B" }, false, false],
  ];
  for (const [name, overrides, isMac, expected] of table) {
    assert.equal(isPreviewToggleKey(press(overrides), isMac), expected, name);
  }
  assert.equal(isMacPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)"), true);
  assert.equal(isMacPlatform("Mozilla/5.0 (X11; Linux x86_64)"), false);
});

test("the shortcut goes to the preview and back to where it came from (EP12)", () => {
  const fromCode = toggledPreviewView({ mode: "code", returnTo: "code" });
  assert.deepEqual(fromCode, { mode: "preview", returnTo: "code" });
  assert.deepEqual(toggledPreviewView(fromCode), { mode: "code", returnTo: "code" });
  const fromSplit = toggledPreviewView({ mode: "split", returnTo: "code" });
  assert.deepEqual(toggledPreviewView(fromSplit), { mode: "split", returnTo: "split" });
  // The Preview button keeps the way back; Code and Split become it.
  assert.deepEqual(choosePreviewMode(fromSplit, "preview"), { mode: "preview", returnTo: "split" });
  assert.deepEqual(choosePreviewMode(fromSplit, "code"), { mode: "code", returnTo: "code" });
});

test("the split claims both combos, so the app's dispatcher yields them (EP11)", () => {
  const event = (overrides: Partial<KeyboardEvent>) =>
    ({ ctrlKey: false, metaKey: false, altKey: false, shiftKey: true, key: "V", ...overrides }) as KeyboardEvent;
  assert.equal(ariaShortcutsInclude(PREVIEW_TOGGLE_ARIA, event({ ctrlKey: true })), true);
  assert.equal(ariaShortcutsInclude(PREVIEW_TOGGLE_ARIA, event({ metaKey: true })), true);
  assert.equal(ariaShortcutsInclude(PREVIEW_TOGGLE_ARIA, event({ ctrlKey: true, shiftKey: false })), false);

  const split = (flavor: "markdown" | null) => renderToStaticMarkup(React.createElement(MarkdownPreviewSplit, {
    flavor, mode: "preview", onToggle: () => undefined, focusEditor: () => undefined,
    preview: React.createElement("p", null, "rendered"), children: React.createElement("div", { id: "host" }),
  }));
  const previewable = split("markdown");
  assert.match(previewable, /aria-keyshortcuts="Control\+Shift\+V Meta\+Shift\+V"/);
  assert.match(previewable, /role="region" aria-label="Preview" tabindex="0"/);
  assert.match(previewable, /rendered/);
  // The editor host stays mounted (hidden) in the preview: Monaco keeps its model.
  assert.match(previewable, /id="host"/);
  const plain = split(null);
  assert.doesNotMatch(plain, /aria-keyshortcuts/);
  assert.doesNotMatch(plain, /rendered/);
});

test("raw HTML and script URLs in a file never become markup (EP1)", () => {
  const hostile = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    '<a href="javascript:alert(1)">raw</a>',
    "[js](javascript:alert(1)) [JS](JAVASCRIPT:alert(1)) [data](data:text/html,<b>x</b>) [vb](vbscript:x)",
    "![pic](javascript:alert(1)) ![pic2](data:image/svg+xml,<svg onload=alert(1)>)",
  ].join("\n\n");
  for (const images of ["alt", "remote"] as const) {
    const html = render(hostile, images);
    assert.doesNotMatch(html, /<script/i, images);
    assert.doesNotMatch(html, /<[^>]+\son[a-z]+=/i, images);
    for (const value of [...attributeValues(html, "href"), ...attributeValues(html, "src")]) {
      assert.doesNotMatch(value, /^\s*(?:javascript|data|vbscript):/i, `${images}: ${value}`);
    }
  }
});

test("only web, mail, phone and footnote links keep an href (EP2)", () => {
  const html = render([
    "[a](https://a.example/x) [b](http://b.example) [m](mailto:a@b.example) [t](tel:+33123)",
    "[rel](docs/a.md) [root](/api/x) [proto](//evil.example) [page](page:abc) [hash](#top)",
    "Note[^1].",
    "",
    "[^1]: The footnote.",
  ].join("\n"), "alt");
  const hrefs = attributeValues(html, "href");
  for (const kept of ["https://a.example/x", "http://b.example", "mailto:a@b.example", "tel:+33123", "#fn-1"]) {
    assert.ok(hrefs.includes(kept), `${kept} in ${hrefs.join(" ")}`);
  }
  assert.deepEqual(hrefs.filter((href) => !/^(?:https?:\/\/|mailto:|tel:|#fn)/.test(href)), []);
  assert.match(html, /href="https:\/\/a\.example\/x"[^>]*target="_blank"|target="_blank"[^>]*href="https:\/\/a\.example\/x"/);
  assert.match(html, /noopener noreferrer/);
  // A dropped link keeps its words.
  assert.match(html, /rel/);
  assert.match(html, /proto/);
});

test("the editor page shows no image at all, the app only https ones (EP3)", () => {
  const source = "![a cat](https://img.example/cat.png) ![local](/x.png)\n\n[Site](https://site.example \"osio:mention\")";
  const editorPage = render(source, "alt");
  assert.doesNotMatch(editorPage, /<img/);
  assert.match(editorPage, /a cat/);
  assert.match(editorPage, /Site/);
  const app = render(source, "remote");
  assert.deepEqual(attributeValues(app, "src"), ["https://img.example/cat.png"]);
  assert.match(app, /local/);
});

test("a file nested past the parser's stack shows a message, not a crash (EP5)", () => {
  // 10 KB, 5000 list levels on one line: the parser's recursion overflows (48 ms measured).
  const deep = `${"- ".repeat(5000)}x\n`;
  assert.deepEqual(parsePreviewDocument(deep, "alt"), { ok: false, reason: "tooDeep" });
  assert.match(render(deep, "alt"), /too deeply nested to preview/);
});

test("a file over the preview cap is not parsed (EP7)", () => {
  const huge = "a".repeat(PREVIEW_MAX_CHARS + 1);
  assert.deepEqual(parsePreviewDocument(huge, "alt"), { ok: false, reason: "tooLarge" });
  assert.match(render(huge, "alt"), /The preview shows files up to 1 MiB\./);
  assert.equal(parsePreviewDocument("a".repeat(PREVIEW_MAX_CHARS), "alt").ok, true);
});

test("an .omd file shows its body, not its front matter (EP9)", () => {
  const html = render(joinFrontMatter({ title: "Secret title", icon: "📄" }, "# Body\n\nSome text."), "alt");
  assert.match(html, /Body/);
  assert.match(html, /Some text\./);
  assert.doesNotMatch(html, /Secret title|title:/);
});
