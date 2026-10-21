/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-polish.test.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the first browser run of the assistant showed: markdown answers, the
 * Ctrl+J chord, a readable usage meter, one AI path in the dock.
 *
 * Pure logic only: no JSX, no server, no network.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderAssistantMarkdown } from "@/features/chat/model/assistantMarkdown";
import { getInferencePort, setInferencePort } from "@/features/chat/model/useChatStore";
import { stubInferencePort } from "@/features/chat/model/inferencePort";
import { formatMicroUsd, formatUsage } from "@/features/settings/ai/aiUsageFormat";
import { aiDockTabVisible, runAiDockTurn } from "@/widgets/contact-dock/model/aiDockModel";
import {
  decideDockHotkey,
  type DockHotkeyKeyEvent,
  type DockHotkeyState,
} from "@/widgets/workbench/model/dockHotkeyDecision";

/* -------------------------------------------------------------------------- */
/* The answers, as markdown                                                   */
/* -------------------------------------------------------------------------- */

/** The answer, as the browser would show it. */
function answer(markdown: string): string {
  return renderToStaticMarkup(
    React.createElement("div", null, ...renderAssistantMarkdown(markdown)),
  );
}

test("an answer's emphasis is emphasis, not asterisks", () => {
  const html = answer("**a**");
  assert.match(html, /<strong>a<\/strong>/);
  assert.doesNotMatch(html, /\*\*/);
});

test("an answer's list is a list", () => {
  const html = answer("- x\n- y");
  assert.match(html, /<ul>/);
  assert.match(html, /<li[^>]*>.*x/s);
  assert.doesNotMatch(html, /^- x/m);
});

test("raw HTML in an answer is text, never an element", () => {
  const script = answer("<script>alert(1)</script>");
  assert.doesNotMatch(script, /<script/i);
  assert.match(script, /&lt;script&gt;/);

  const injected = answer("<img src=x onerror=alert(1)>");
  assert.doesNotMatch(injected, /<img/i);
  assert.match(injected, /onerror/, "the source is shown, as text");
});

test("an image in an answer is its alt text and a link — never a remote picture", () => {
  const html = answer("![a](https://evil/x.png)");
  assert.doesNotMatch(html, /<img/i, "no remote picture is fetched");
  assert.doesNotMatch(html, /rel="preload"/, "and nothing preloads it either");
  assert.match(html, /href="https:\/\/evil\/x\.png"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, />a</, "the alt text is what the reader sees");
});

test("a half-written answer does not break the layout", () => {
  const html = answer("**unclosed bold");
  assert.match(html, /\*\*unclosed bold/);
});

test("an answer's links open in a new tab, safely", () => {
  const html = answer("[read](https://example.com/x)");
  assert.match(html, /<a [^>]*href="https:\/\/example\.com\/x"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test("an answer's code is code", () => {
  assert.match(answer("`x`"), /<code[^>]*>x<\/code>/);
  assert.match(answer("```js\nconst a = 1;\n```"), /<pre[^>]*><code[^>]*>const a = 1;<\/code><\/pre>/);
});

/* -------------------------------------------------------------------------- */
/* The chord                                                                  */
/* -------------------------------------------------------------------------- */

function key(over: Partial<DockHotkeyKeyEvent> = {}): DockHotkeyKeyEvent {
  return { key: "j", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, ...over };
}

function state(over: Partial<DockHotkeyState> = {}): DockHotkeyState {
  return { target: "other", hasSelectedBlock: false, ...over };
}

test("Ctrl+J in a block asks the AI", () => {
  assert.equal(decideDockHotkey(key(), state({ target: "block-editable" })), "ask-ai");
});

test("Ctrl+J on a selected block asks the AI", () => {
  assert.equal(decideDockHotkey(key(), state({ hasSelectedBlock: true })), "ask-ai");
});

test("Ctrl+J anywhere else toggles the dock", () => {
  assert.equal(decideDockHotkey(key(), state()), "dock");
  assert.equal(decideDockHotkey(key(), state({ target: "input" })), "dock");
  assert.equal(
    decideDockHotkey(key(), state({ target: "input", hasSelectedBlock: true })),
    "dock",
    "the user is typing somewhere else: the selection does not count",
  );
});

test("Ctrl+` is always the dock's chord", () => {
  assert.equal(decideDockHotkey(key({ key: "`" }), state()), "dock");
  assert.equal(decideDockHotkey(key({ key: "`" }), state({ target: "block-editable" })), "dock");
  assert.equal(decideDockHotkey(key({ key: "`" }), state({ target: "input" })), "dock");
});

test("Ctrl+Shift+J is nobody's chord", () => {
  assert.equal(decideDockHotkey(key({ shiftKey: true }), state()), null);
  assert.equal(decideDockHotkey(key({ shiftKey: true }), state({ target: "block-editable" })), null);
});

test("a key without Ctrl is nobody's chord", () => {
  assert.equal(decideDockHotkey(key({ ctrlKey: false }), state()), null);
  assert.equal(decideDockHotkey(key({ metaKey: true }), state()), null);
});

/* -------------------------------------------------------------------------- */
/* The usage meter                                                            */
/* -------------------------------------------------------------------------- */

test("the usage meter reads like money", () => {
  assert.equal(formatMicroUsd(0, "en-US"), "$0.00");
  assert.equal(formatMicroUsd(200_000, "en-US"), "$0.20");
  assert.equal(formatUsage(0, 200_000, "en-US"), "$0.00 of $0.20");
});

test("the meter follows the reader's locale", () => {
  const french = formatMicroUsd(200_000, "fr-FR");
  assert.notEqual(french, "$0.20");
  assert.match(french, /0,20/);
});

/* -------------------------------------------------------------------------- */
/* The dock's AI tab                                                          */
/* -------------------------------------------------------------------------- */

test("the dock's AI tab shows only when the app can answer", async () => {
  const off = await import("@/features/ai/api/aiClient");
  assert.equal(off.isAiConfigured(), false, "no service: nothing to answer with");
  assert.equal(aiDockTabVisible(off.isAiConfigured()), false);

  const on = await import(
    `../../src/features/ai/api/aiClient.ts?env=${encodeURIComponent(JSON.stringify({ VITE_AI_URL: "http://ai.test" }))}`
  );
  assert.equal(on.isAiConfigured(), true);
  assert.equal(aiDockTabVisible(on.isAiConfigured()), true);
});

test("the dock's AI tab answers through the injected port", async () => {
  const asked: string[] = [];
  const deltas: string[] = [];
  setInferencePort({
    complete: async () => ({ content: "" }),
    stream: async (request, onEvent) => {
      asked.push(request.text);
      onEvent("text.delta", { text: "hi" });
      onEvent("done", {});
    },
  });
  try {
    await runAiDockTurn({
      port: getInferencePort(),
      conversationId: "dock-1",
      text: "hello",
      onDelta: (text) => deltas.push(text),
    });
  } finally {
    setInferencePort(stubInferencePort);
  }
  assert.deepEqual(asked, ["hello"], "the injected port is the one that answers");
  assert.deepEqual(deltas, ["hi"]);
});

test("a port without a stream answers in one piece", async () => {
  const deltas: string[] = [];
  await runAiDockTurn({
    port: { complete: async () => ({ content: "whole answer" }) },
    conversationId: "dock-2",
    text: "hello",
    onDelta: (text) => deltas.push(text),
  });
  assert.deepEqual(deltas, ["whole answer"]);
});
