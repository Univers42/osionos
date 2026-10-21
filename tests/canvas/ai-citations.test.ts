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
import { renderCitationSources, renderCitedAnswer } from "@/features/chat/model/citedAnswer";

/* -------------------------------------------------------------------------- */
/* The markers of an answer                                                   */
/* -------------------------------------------------------------------------- */

const SOURCE_ONE: Citation = { n: 1, pageId: "page-a", title: "Alpha", snippet: "the first source" };
const SOURCE_TWO: Citation = { n: 2, pageId: "page-b", title: "Beta", snippet: "the second source" };

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
      renderCitationSources([{ n: 1, pageId: "page-a", title: hostile, snippet: hostile }], () => undefined),
    ),
  );
  assert.doesNotMatch(html, /<img/i, "the payload is never an element");
  assert.doesNotMatch(html, /<pre|<code/i, "and it is not markdown-rendered either");
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

test("a frame that is not a source is dropped", () => {
  assert.equal(citationFromEvent({ n: 0, pageId: "page-a" }), null);
  assert.equal(citationFromEvent({ n: 1 }), null, "a source without a page is not a source");
  assert.equal(citationFromEvent({ pageId: "page-a" }), null, "a source without a number is not a source");
});
