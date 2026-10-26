/**
 * The composer writes markdown and the user's own message renders it:
 * the pure wrap/unwrap edit, the user bubble, and the preview.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderAssistantMarkdown } from "@/features/chat/model/assistantMarkdown";
import { keepLineBreaks, minimalReplacement, SHORTCUT_MARKERS, shortcutMarker, wrapSelection } from "@/features/chat/model/composerMarkdown";
import { UserBubble } from "@/features/chat/ui/MessageActions";
import { PreviewToggle, UserMarkdown } from "@/features/chat/ui/UserMarkdown";

const bubble = (content: string) =>
  renderToStaticMarkup(React.createElement(UserBubble, { content, canEdit: true, onResend: () => {} }));

test("wrapSelection wraps a selection and selects the inside", () => {
  const edit = wrapSelection("make this bold", 10, 14, "**");
  assert.deepEqual(edit, { value: "make this **bold**", selectionStart: 12, selectionEnd: 16 });
});

test("wrapSelection unwraps markers outside the selection", () => {
  const edit = wrapSelection("make this **bold**", 12, 16, "**");
  assert.deepEqual(edit, { value: "make this bold", selectionStart: 10, selectionEnd: 14 });
});

test("wrapSelection unwraps markers inside the selection", () => {
  const edit = wrapSelection("a **b** c", 2, 7, "**");
  assert.deepEqual(edit, { value: "a b c", selectionStart: 2, selectionEnd: 3 });
});

test("wrapSelection with an empty selection puts the caret between the pair", () => {
  const edit = wrapSelection("ab", 1, 1, "`");
  assert.deepEqual(edit, { value: "a``b", selectionStart: 2, selectionEnd: 2 });
});

test("Ctrl+K stays Search: the link is Ctrl+Shift+K, the strike-through Ctrl+Shift+X", () => {
  assert.equal(shortcutMarker("k", false), null);
  assert.equal(shortcutMarker("K", true), "link");
  assert.equal(shortcutMarker("x", false), null);
  assert.equal(shortcutMarker("X", true), "~~");
  assert.equal(shortcutMarker("b", false), "**");
  assert.equal(shortcutMarker("B", true), null);
  assert.equal(shortcutMarker("z", false), null);
});

test("wrapSelection knows every marker", () => {
  assert.deepEqual(Object.values(SHORTCUT_MARKERS).sort(), ["_", "`", "**", "link", "~~"].sort());
  for (const marker of ["**", "_", "`", "~~"] as const) {
    const edit = wrapSelection("word", 0, 4, marker);
    assert.equal(edit.value, `${marker}word${marker}`);
    assert.equal(wrapSelection(edit.value, edit.selectionStart, edit.selectionEnd, marker).value, "word");
  }
});

test("wrapSelection link selects the url, and unwraps a whole link", () => {
  const edit = wrapSelection("see docs now", 4, 8, "link");
  assert.equal(edit.value, "see [docs](url) now");
  assert.equal(edit.value.slice(edit.selectionStart, edit.selectionEnd), "url");
  const back = wrapSelection(edit.value, 4, 15, "link");
  assert.equal(back.value, "see docs now");
  const empty = wrapSelection("", 0, 0, "link");
  assert.equal(empty.value, "[](url)");
  assert.equal(empty.value.slice(empty.selectionStart, empty.selectionEnd), "url");
});

test("wrapSelection at the very start and the very end", () => {
  assert.equal(wrapSelection("hello world", 0, 5, "_").value, "_hello_ world");
  assert.equal(wrapSelection("hello world", 6, 11, "_").value, "hello _world_");
  assert.equal(wrapSelection("_hello_ world", 1, 6, "_").value, "hello world");
});

test("minimalReplacement types only the difference", () => {
  assert.deepEqual(minimalReplacement("ab", "a**b"), { from: 1, to: 1, text: "**" });
  const unwrap = minimalReplacement("a **b** c", "a b c");
  assert.equal("a **b** c".slice(0, unwrap.from) + unwrap.text + "a **b** c".slice(unwrap.to), "a b c");
});

test("the user bubble renders markdown", () => {
  assert.match(bubble("make this **bold**"), /<strong[^>]*>bold<\/strong>/);
  assert.match(bubble("hi"), /aria-label="Edit message"/);
});

test("the user bubble never renders raw HTML", () => {
  const html = bubble("<img src=x onerror=alert(1)>");
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test("the user bubble turns a remote image into a link", () => {
  const html = bubble("![a](https://evil.example/x.png)");
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /<a [^>]*href="https:\/\/evil\.example\/x\.png"/);
});

test("plain multi-line text keeps its line breaks", () => {
  const html = bubble("one\ntwo\n\nthree");
  assert.match(html, /one[\s\S]*two/);
  assert.match(html, /<p[^>]*>one<\/p><p[^>]*>two<\/p><p[^>]*>three<\/p>/);
});

test("the preview renders the draft through the shared function", () => {
  const draft = "make this **bold**";
  const preview = renderToStaticMarkup(React.createElement(UserMarkdown, { markdown: draft }));
  const direct = renderToStaticMarkup(React.createElement("div", null, renderAssistantMarkdown(draft)));
  assert.ok(preview.includes(direct.slice("<div>".length, -"</div>".length)));
});

test("the preview button is a pressed-state button", () => {
  const off = renderToStaticMarkup(React.createElement(PreviewToggle, { pressed: false, onToggle: () => {} }));
  const on = renderToStaticMarkup(React.createElement(PreviewToggle, { pressed: true, onToggle: () => {} }));
  assert.match(off, /<button[^>]*type="button"[^>]*aria-pressed="false"/);
  assert.match(on, /aria-pressed="true"/);
  assert.match(on, /Preview/);
});

test("keepLineBreaks leaves lists and fenced code alone", () => {
  assert.equal(keepLineBreaks("- a\n- b"), "- a\n- b");
  assert.equal(keepLineBreaks("```\na\nb\n```"), "```\na\nb\n```");
  assert.equal(keepLineBreaks("a\nb"), "a\n\nb");
});
