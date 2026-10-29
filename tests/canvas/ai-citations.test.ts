/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-citations.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The assistant cites its sources.
 *
 * Pure logic only: no JSX, no server, no network.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  citationFromEvent,
  citationsFromParts,
  segmentAnswer,
  type Citation,
} from "@/features/chat/model/citations";
import type { ChatMessagePart } from "@/features/chat/model/chatTypes";
import { renderCitationSources, renderCitedAnswer } from "@/features/chat/model/citedAnswer";

/* -------------------------------------------------------------------------- */
/* The markers of an answer                                                   */
/* -------------------------------------------------------------------------- */

const SOURCE_ONE: Citation = { n: 1, collection: "page", pageId: "page-a", title: "Alpha", snippet: "the first source" };
const SOURCE_TWO: Citation = { n: 2, collection: "page", pageId: "page-b", title: "Beta", snippet: "the second source" };
const PACK_SOURCE: Citation = {
  n: 2,
  collection: "pack",
  pack: "product-docs",
  title: "Getting started",
  snippet: "the pack passage",
};

/** The kinds of the segments, in order — "text", "cite", "text"… */
function kinds(segments: ReturnType<typeof segmentAnswer>): string[] {
  return segments.map((segment) => segment.kind);
}

test("a marker with a source is a marker, and the text around it stays text", () => {
  const segments = segmentAnswer("A [1] and [2].", [SOURCE_ONE, SOURCE_TWO]);
  assert.deepEqual(kinds(segments), ["text", "cite", "text", "cite", "text"]);
  assert.equal(segments[0].text, "A ");
  assert.equal(segments[1].kind === "cite" ? segments[1].n : 0, 1);
  assert.equal(segments[2].text, " and ");
  assert.equal(segments[3].kind === "cite" ? segments[3].n : 0, 2);
  assert.equal(segments[4].text, ".");
});

test("a marker without a source stays the text it was", () => {
  const segments = segmentAnswer("A [3].", [SOURCE_ONE, SOURCE_TWO]);
  assert.deepEqual(kinds(segments), ["text"]);
  assert.equal(segments[0].text, "A [3].");
});

test("a marker inside a code span stays literal", () => {
  const segments = segmentAnswer("`[1]`", [SOURCE_ONE]);
  assert.deepEqual(kinds(segments), ["text"]);
  assert.equal(segments[0].text, "`[1]`");
});

test("a marker inside a code block stays literal", () => {
  const answer = "```\nconst a = [1];\n```";
  const segments = segmentAnswer(answer, [SOURCE_ONE]);
  assert.deepEqual(kinds(segments), ["text"]);
  assert.equal(segments[0].text, answer);
});

test("an answer without a source is one piece of text", () => {
  const segments = segmentAnswer("Just an answer.", []);
  assert.deepEqual(kinds(segments), ["text"]);
});

/* -------------------------------------------------------------------------- */
/* The answer, rendered                                                       */
/* -------------------------------------------------------------------------- */

/** The answer, as the browser would show it. */
function answer(markdown: string, citations: Citation[] = []): string {
  return renderToStaticMarkup(
    React.createElement("div", null, ...renderCitedAnswer(markdown, citations, () => undefined)),
  );
}

test("a marker with a source is a small button", () => {
  const html = answer("A [1] and [2].", [SOURCE_ONE, SOURCE_TWO]);
  assert.match(html, /<button[^>]*>1<\/button>/);
  assert.match(html, /<button[^>]*>2<\/button>/);
  assert.match(html, /<sup[^>]*>/, "the marker is a superscript");
});

test("the marker of a pack source is not a button, and its tooltip is the snippet", () => {
  const html = answer("A pack says so [2].", [PACK_SOURCE]);
  assert.doesNotMatch(html, /<button/, "a pack passage is not a page to open");
  assert.match(html, /<sup[^>]*><span[^>]*title="the pack passage"[^>]*>2<\/span><\/sup>/);
});

test("a marker without a source stays the text it was", () => {
  const html = answer("A [3].", [SOURCE_ONE]);
  assert.doesNotMatch(html, /<button/);
  assert.match(html, /\[3\]/);
});

test("the markdown of the answer survives the markers", () => {
  const html = answer("**Bold [1]** and a [link](https://example.com/x).", [SOURCE_ONE]);
  assert.match(html, /<strong>Bold <sup[^>]*><button/, "the emphasis wraps the marker");
  assert.match(html, /href="https:\/\/example\.com\/x"/, "the link is still a link");
});

test("a marker inside a code span stays literal in the rendered answer", () => {
  const html = answer("`[1]`", [SOURCE_ONE]);
  assert.doesNotMatch(html, /<button/);
  assert.match(html, /<code[^>]*>\[1\]<\/code>/);
});

/* -------------------------------------------------------------------------- */
/* The sources of an answer                                                   */
/* -------------------------------------------------------------------------- */

test("the sources are listed under the answer, with the snippet as a tooltip", () => {
  const html = renderToStaticMarkup(
    React.createElement("div", null, renderCitationSources([SOURCE_ONE, SOURCE_TWO], () => undefined)),
  );
  assert.match(html, /Sources/);
  assert.match(html, /1\. Alpha/);
  assert.match(html, /2\. Beta/);
  assert.match(html, /title="the first source"/, "the snippet is the tooltip");
});

test("a title and a snippet are plain text — never an element", () => {
  const hostile = "<img src=x onerror=alert(1)>";
  const html = renderToStaticMarkup(
    React.createElement(
      "div",
      null,
      renderCitationSources([{ n: 1, collection: "page", pageId: "page-a", title: hostile, snippet: hostile }], () => undefined),
    ),
  );
  assert.doesNotMatch(html, /<img/i, "the payload is never an element");
  assert.doesNotMatch(html, /<pre|<code/i, "and it is not markdown-rendered either");
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/, "the payload is shown as text");
});

test("a pack source is a plain line with its snippet, not a button", () => {
  const html = renderToStaticMarkup(
    React.createElement("div", null, renderCitationSources([PACK_SOURCE], () => undefined)),
  );
  assert.doesNotMatch(html, /<button/, "a pack passage is not a page to open");
  assert.match(html, /<span[^>]*title="the pack passage"[^>]*>2\. Getting started · osionos docs<\/span>/);
});

test("a page source is still a button", () => {
  const html = renderToStaticMarkup(
    React.createElement("div", null, renderCitationSources([SOURCE_ONE], () => undefined)),
  );
  assert.match(html, /<button[^>]*>1\. Alpha<\/button>/);
});

test("a pack title is plain text — never an element", () => {
  const hostile = "<img src=x onerror=alert(1)>";
  const html = renderToStaticMarkup(
    React.createElement(
      "div",
      null,
      renderCitationSources(
        [{ n: 1, collection: "pack", pack: "product-docs", title: hostile, snippet: hostile }],
        () => undefined,
      ),
    ),
  );
  assert.doesNotMatch(html, /<img/i, "the payload is never an element");
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/, "the payload is shown as text");
});

/* -------------------------------------------------------------------------- */
/* The sources of a run                                                       */
/* -------------------------------------------------------------------------- */

test("the frames of a run and the stored parts are the same list of sources", () => {
  const frames = [
    { n: 1, pageId: "page-a", blockId: "block-1", title: "Alpha", snippet: "the first source" },
    { n: 2, pageId: "page-b", title: "Beta", snippet: "the second source" },
  ];
  const streamed = frames.map((frame) => citationFromEvent(frame)).filter((citation) => citation !== null);
  const stored = citationsFromParts([
    { type: "citation", pageId: "page-a", blockId: "block-1", title: "Alpha", snippet: "the first source" },
    { type: "citation", pageId: "page-b", title: "Beta", snippet: "the second source" },
  ]);
  assert.deepEqual(streamed, stored);
  assert.deepEqual(stored.map((citation) => citation.n), [1, 2], "the sources are numbered in order");
});

test("a stored part keeps its number: the sources are listed by number", () => {
  const stored = citationsFromParts([
    { type: "citation", n: 1, pageId: "page-a", title: "Alpha", snippet: "one" },
    { type: "citation", n: 3, pageId: "page-c", title: "Gamma", snippet: "three" },
    { type: "citation", n: 2, pageId: "page-b", title: "Beta", snippet: "two" },
  ]);
  assert.deepEqual(
    stored.map((citation) => [citation.n, citation.collection === "page" ? citation.pageId : citation.pack]),
    [
      [1, "page-a"],
      [2, "page-b"],
      [3, "page-c"],
    ],
  );
});

test("a frame that is not a source is dropped", () => {
  assert.equal(citationFromEvent({ n: 0, pageId: "page-a" }), null);
  assert.equal(citationFromEvent({ n: 1 }), null, "a source without a page is not a source");
  assert.equal(citationFromEvent({ pageId: "page-a" }), null, "a source without a number is not a source");
});

test("a pack frame becomes a pack source", () => {
  const citation = citationFromEvent({
    n: 2,
    collection: "pack",
    pack: "product-docs",
    title: "Getting started",
    snippet: "the pack passage",
  });
  assert.deepEqual(citation, {
    n: 2,
    collection: "pack",
    pack: "product-docs",
    title: "Getting started",
    snippet: "the pack passage",
  });
});

test("a pack frame with a bad slug is dropped", () => {
  for (const pack of ["Bad_Slug", "../x"]) {
    assert.equal(
      citationFromEvent({ n: 1, collection: "pack", pack, title: "Getting started", snippet: "passage" }),
      null,
      `${pack} is not a pack slug`,
    );
  }
});

test("a frame with neither a page nor a pack is dropped", () => {
  assert.equal(citationFromEvent({ n: 1, title: "Nowhere", snippet: "nothing" }), null);
});

test("a stored part with no page and no pack is dropped", () => {
  const parts = [
    { type: "citation", n: 1, pageId: "page-a", title: "Alpha", snippet: "one" },
    { type: "citation", n: 2, title: "Nowhere", snippet: "two" },
  ] as unknown as ChatMessagePart[];
  assert.deepEqual(
    citationsFromParts(parts).map(({ n, title }) => [n, title]),
    [[1, "Alpha"]],
  );
});

test("a pack part is kept among the page parts, in number order", () => {
  const parts = [
    { type: "citation", n: 1, collection: "page", pageId: "page-a", title: "Alpha", snippet: "one" },
    { type: "citation", n: 3, collection: "pack", pack: "product-docs", title: "Getting started", snippet: "three" },
    { type: "citation", n: 2, collection: "page", pageId: "page-b", title: "Beta", snippet: "two" },
  ] as unknown as ChatMessagePart[];
  const stored = citationsFromParts(parts);
  assert.deepEqual(
    stored.map(({ n, collection }) => [n, collection]),
    [
      [1, "page"],
      [2, "page"],
      [3, "pack"],
    ],
  );
  assert.deepEqual(stored[2], {
    n: 3,
    collection: "pack",
    pack: "product-docs",
    title: "Getting started",
    snippet: "three",
  });
});

test("opening a pack source never touches the page store", async () => {
  const [{ openCitation }, { usePageStore }] = await Promise.all([
    import("@/features/chat/model/openCitation"),
    import("@/store/usePageStore"),
  ]);
  const original = usePageStore.getState;
  let calls = 0;
  usePageStore.getState = (() => {
    calls += 1;
    return original();
  }) as typeof usePageStore.getState;
  try {
    openCitation(PACK_SOURCE);
  } finally {
    usePageStore.getState = original;
  }
  assert.equal(calls, 0, "a pack passage has no page to open");
});
