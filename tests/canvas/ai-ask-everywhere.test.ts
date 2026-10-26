/**
 * "Ask AI" from a channel message and a comment thread (h2-ask-everywhere
 * verdict C419-C427): the quote that is handed over, which comments it may
 * hold, and the button that is drawn only with the service.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MAX_QUOTE_CHARS, quoteForAssistant, useAssistantHandoff } from "@/features/chat/model/assistantHandoff";
import { openAssistantWith } from "@/features/chat/model/openAssistantWith";
import type { Comment } from "@/features/comments/api/commentsClient";
import { threadEntries } from "@/features/comments/model/askAboutThread";
import { CommentsPanel } from "@/features/comments/ui/CommentsPanel";

test("C420 the quote is fenced line by line under its author", () => {
  assert.equal(
    quoteForAssistant([{ author: "Ada", text: "line one\nline two" }, { author: "**Bob**\n", text: "ok" }]),
    "> **Ada:**\n> line one\n> line two\n>\n> **Bob:**\n> ok\n\n",
  );
  assert.equal(quoteForAssistant([]), "");
  assert.equal(quoteForAssistant([{ author: "  ", text: "x" }]), "> **Member:**\n> x\n\n");
});

test("C420 a long thread is cut on a line boundary with an ellipsis, under the cap", () => {
  const entries = Array.from({ length: 200 }, (_, i) => ({ author: "Member", text: `message number ${i} `.repeat(3) }));
  const quote = quoteForAssistant(entries);
  assert.ok(quote.length <= MAX_QUOTE_CHARS, `${quote.length}`);
  assert.ok(quote.trimEnd().endsWith("> …"));
  assert.ok(quote.includes("message number 0"));
  assert.equal(quote.includes("message number 199"), false);
});

test("C420 one overlong message is cut inside the line, so it still says something", () => {
  const quote = quoteForAssistant([{ author: "Ada", text: "x".repeat(10_000) }]);
  assert.ok(quote.length <= MAX_QUOTE_CHARS, `${quote.length}`);
  assert.ok(quote.includes("xxxxxxxxxx"));
  assert.ok(quote.trimEnd().endsWith("…"));
});

const comment = (id: string, authorId: string, content: string, moderationState?: Comment["moderationState"]): Comment =>
  ({ id, authorId, content, moderationState, resolvedAt: null } as unknown as Comment);

test("C422 a held or removed comment of someone else is never quoted; the viewer's own is", () => {
  const entries = threadEntries(
    [
      comment("1", "me", "mine, visible"),
      comment("2", "other", "theirs, held", "held"),
      comment("3", "other", "theirs, removed", "removed"),
      comment("4", "me", "mine, held", "held"),
      comment("5", "other", "theirs, legacy", null),
      comment("6", "other", "theirs, visible", "visible"),
    ],
    "me",
  );
  assert.deepEqual(entries, [
    { author: "You", text: "mine, visible" },
    { author: "You", text: "mine, held" },
    { author: "Member", text: "theirs, legacy" },
    { author: "Member", text: "theirs, visible" },
  ]);
});

const panel = (props: Partial<React.ComponentProps<typeof CommentsPanel>>) =>
  renderToStaticMarkup(
    React.createElement(CommentsPanel, {
      comments: [comment("1", "me", "hello")],
      loading: false,
      meId: "me",
      onAdd: async () => ({ ok: true }) as never,
      onResolve() {},
      onRemove() {},
      ...props,
    }),
  );

test("C424 the thread's Ask AI is drawn only with the service, and only on a thread", () => {
  assert.equal(panel({}).includes("comments-ask-ai"), false);
  assert.ok(panel({ onAskAI() {} }).includes("Ask AI about this thread"));
  assert.equal(panel({ onAskAI() {}, comments: [] }).includes("comments-ask-ai"), false);
});

test("C419 C423 C425 the hand-off carries the quote and the page id only, and replaces a pending one", () => {
  useAssistantHandoff.getState().handOff({ attachments: ["/api/media/uploads/x/y.png"], text: "older" });
  openAssistantWith({ text: "> **You:**\n> hi\n\n", pageId: "page-1" });
  assert.deepEqual(useAssistantHandoff.getState().take(), { attachments: [], text: "> **You:**\n> hi\n\n", pageId: "page-1" });
  assert.equal(useAssistantHandoff.getState().take(), null, "taken once");
});
