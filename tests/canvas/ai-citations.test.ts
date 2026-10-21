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
 * The assistant cites its sources, and "@" points it at pages or the whole
 * workspace.
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
import {
  addContextChip,
  buildRunContext,
  contextTrigger,
  MAX_CONTEXT_PAGES,
  WORKSPACE_CHIP,
  type ContextChip,
} from "@/features/ai/model/aiContext";
import {
  DEFAULT_CONVERSATION_TITLE,
  resolveConversationTitle,
} from "@/features/chat/model/conversationTitle";

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
/* The context of a run                                                       */
/* -------------------------------------------------------------------------- */

function pageChip(id: string): ContextChip {
  return { id, kind: "page", label: id, pageId: id };
}

test("the chips are the context of the run", () => {
  const chips = [pageChip("a"), pageChip("b"), WORKSPACE_CHIP];
  assert.deepEqual(buildRunContext(chips), { pageIds: ["a", "b"], workspace: true });
});

test("a fourth page is refused, and the reader is told why", () => {
  let chips: ContextChip[] = [];
  for (const id of ["a", "b", "c"]) {
    const added = addContextChip(chips, pageChip(id));
    assert.equal(added.refusal, null, "three pages are allowed");
    chips = added.chips;
  }
  assert.equal(chips.length, MAX_CONTEXT_PAGES);

  const fourth = addContextChip(chips, pageChip("d"));
  assert.equal(fourth.chips.length, MAX_CONTEXT_PAGES, "the fourth page is not added");
  assert.match(fourth.refusal ?? "", /3 pages/, "and the reader is told in one line");
});

test("the same page twice is one chip", () => {
  const first = addContextChip([], pageChip("a"));
  const second = addContextChip(first.chips, pageChip("a"));
  assert.equal(second.chips.length, 1);
  assert.equal(second.refusal, null);
});

test("the whole workspace is one chip", () => {
  const first = addContextChip([], WORKSPACE_CHIP);
  const second = addContextChip(first.chips, WORKSPACE_CHIP);
  assert.equal(second.chips.length, 1);
  assert.deepEqual(buildRunContext(second.chips), { pageIds: [], workspace: true });
});

test("the @ opens the picker, and only when it stands alone", () => {
  assert.deepEqual(contextTrigger("look at @", 9), { query: "", start: 8 });
  assert.deepEqual(contextTrigger("look at @Alp", 12), { query: "Alp", start: 8 });
  assert.equal(contextTrigger("mail me at a@b.fr", 18), null, "an email address is not a trigger");
  assert.equal(contextTrigger("look at pages", 12), null);
});

/* -------------------------------------------------------------------------- */
/* The title of a conversation                                                */
/* -------------------------------------------------------------------------- */

test("the default title gives way to the title the service set", () => {
  assert.equal(resolveConversationTitle(DEFAULT_CONVERSATION_TITLE, "What is the plan?"), "What is the plan?");
  assert.equal(resolveConversationTitle("", "What is the plan?"), "What is the plan?");
});

test("a title the reader renamed is kept", () => {
  assert.equal(resolveConversationTitle("My own title", "What is the plan?"), "My own title");
});

test("no title from the service changes nothing", () => {
  assert.equal(resolveConversationTitle(DEFAULT_CONVERSATION_TITLE, undefined), DEFAULT_CONVERSATION_TITLE);
  assert.equal(resolveConversationTitle(DEFAULT_CONVERSATION_TITLE, "   "), DEFAULT_CONVERSATION_TITLE);
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

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

function shimLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: () => null,
    length: 0,
  };
}

/** A port that answers with the frames it is given. */
function fakePort(frames: Array<[string, Record<string, unknown>]>) {
  return {
    async complete() {
      return { content: "" };
    },
    async stream(
      _request: unknown,
      onEvent: (event: string, data: Record<string, unknown>) => void,
    ) {
      for (const [event, data] of frames) onEvent(event, data);
    },
  };
}

test("the store keeps the sources of the answer", async () => {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();

  setInferencePort(
    fakePort([
      ["run.started", { runId: "run-1" }],
      ["citation", { n: 1, pageId: "page-a", blockId: "block-1", title: "Alpha", snippet: "the first source" }],
      ["citation", { n: 2, pageId: "page-b", title: "Beta", snippet: "the second source" }],
      ["text.delta", { text: "A [1] and [2]." }],
      ["done", {}],
    ]),
  );

  const conversation = s().createConversation(null);
  await s().send(conversation.id, "hello");

  const assistant = s().messagesFor(conversation.id)[1];
  assert.deepEqual(citationsFromParts(assistant.parts), [
    { n: 1, pageId: "page-a", blockId: "block-1", title: "Alpha", snippet: "the first source" },
    { n: 2, pageId: "page-b", title: "Beta", snippet: "the second source" },
  ]);
});

test("the store takes the title of the service, unless the reader renamed it", async () => {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();

  setInferencePort(
    fakePort([
      ["run.started", { runId: "run-1", conversationTitle: "What is the plan?" }],
      ["done", {}],
    ]),
  );

  const fresh = s().createConversation(null);
  await s().send(fresh.id, "what is the plan");
  assert.equal(
    s().conversations.find((c) => c.id === fresh.id)?.title,
    "What is the plan?",
    "the default title gives way to the service's",
  );

  setInferencePort(
    fakePort([
      ["run.started", { runId: "run-2", conversationTitle: "What is the plan?" }],
      ["done", {}],
    ]),
  );

  const renamed = s().createConversation(null, { title: "My own title" });
  await s().send(renamed.id, "what is the plan");
  assert.equal(
    s().conversations.find((c) => c.id === renamed.id)?.title,
    "My own title",
    "a title the reader renamed is kept",
  );
});
