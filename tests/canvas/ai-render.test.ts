/**
 * How an answer reads: code blocks, diagrams, reasoning, message actions,
 * and a long thread.
 *
 * The suite has no DOM and no JSX transform, so the components are rendered to
 * static markup and the store is driven through its actions. Mermaid itself
 * does not run under node: the decision (draw, code or refuse) and the locked
 * source are tested, and the component is rendered with the drawer stubbed.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderAssistantMarkdown } from "@/features/chat/model/assistantMarkdown";
import { codeBlockView } from "@/features/chat/model/answerCode";
import { MESSAGE_PAGE, windowStart } from "@/features/chat/model/messageWindow";
import type { ChatMessage } from "@/features/chat/model/chatTypes";
import type { InferencePort } from "@/features/chat/model/inferencePort";
import { AnswerRenderContext } from "@/features/chat/ui/answerRenderContext";
import { AssistantActions } from "@/features/chat/ui/MessageActions";
import { MessageWindow } from "@/features/chat/ui/MessageWindow";
import { ReasoningNote } from "@/features/chat/ui/ReasoningNote";
import { MAX_MERMAID_SOURCE } from "@/features/diagram/model/diagramSpec";

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

/** The answer, as the thread draws it. `drawDiagram` stubs the locked renderer. */
function renderAnswer(markdown: string, complete: boolean, withDrawer = true): string {
  const drawDiagram = withDrawer
    ? (source: string) => React.createElement("figure", { "data-locked-source": source }, "DIAGRAM")
    : undefined;
  return renderToStaticMarkup(
    React.createElement(
      AnswerRenderContext.Provider,
      { value: { complete, drawDiagram } },
      React.createElement(React.Fragment, null, ...renderAssistantMarkdown(markdown)),
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Code blocks                                                                */
/* -------------------------------------------------------------------------- */

test("a ts fence shows its language, Copy, an unpressed Wrap, and the code as text", () => {
  const html = renderAnswer("```ts\nconst a: number = 1;\n```", true);
  assert.match(html, />ts</);
  assert.match(html, /aria-label="Copy code"/);
  assert.match(html, /aria-pressed="false"[^>]*>Wrap<|aria-label="Wrap lines"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*aria-label="Wrap lines"/);
  assert.match(html, /<pre[^>]*><code>const a: number = 1;<\/code><\/pre>/);
  assert.match(html, /role="status"/, "a live region announces Copied");
});

test("hostile code is text, never an element", () => {
  const html = renderAnswer("```html\n</code><img src=x onerror=1>\n```", true);
  assert.equal(html.includes("<img"), false);
  assert.match(html, /&lt;\/code&gt;&lt;img src=x onerror=1&gt;/);
});

/* -------------------------------------------------------------------------- */
/* Mermaid in answers                                                         */
/* -------------------------------------------------------------------------- */

test("a complete answer draws a mermaid fence through the locked source", () => {
  const html = renderAnswer("```mermaid\n%%{init: {\"securityLevel\":\"loose\"}}%%\nflowchart LR\nA-->B\nclick A \"javascript:alert(1)\"\n```", true);
  assert.match(html, /data-locked-source=/);
  assert.equal(html.includes("securityLevel"), false, "the directive is stripped");
  assert.equal(html.includes("click A"), false, "the click line is stripped");
  assert.equal(html.includes('data-testid="answer-code"'), false, "a drawn diagram is not also code");
});

test("the same answer while streaming is a code block", () => {
  const html = renderAnswer("```mermaid\nflowchart LR\nA-->B\n```", false);
  assert.equal(html.includes("data-locked-source"), false);
  assert.match(html, /data-testid="answer-code"/);
  assert.match(html, />mermaid</);
});

test("a surface with no drawer never draws a diagram", () => {
  const html = renderAnswer("```mermaid\nflowchart LR\nA-->B\n```", true, false);
  assert.equal(html.includes("data-locked-source"), false);
  assert.match(html, /data-testid="answer-code"/);
});

test("an XSS label renders no <img>", () => {
  const fence = "```mermaid\nflowchart LR\nA[\"<img src=x onerror=alert(1)>\"]-->B\n```";
  assert.equal(renderAnswer(fence, false).includes("<img"), false, "streaming: shown as code text");
  assert.equal(renderAnswer(fence, true).includes("<img"), false, "complete: the locked source is an attribute value");
});

test("a source the locked renderer refuses shows the code and the note", () => {
  const huge = "flowchart LR\n" + "A-->B\n".repeat(MAX_MERMAID_SOURCE);
  assert.equal(codeBlockView("mermaid", huge, true).kind, "refused");
  assert.equal(codeBlockView("mermaid", "   \n", true).kind, "refused");
  const html = renderAnswer("```mermaid\n" + huge + "```", true);
  assert.match(html, /This diagram can(&#x27;|')t be drawn/);
  assert.equal(html.includes("data-locked-source"), false);
});

test("the decision: code while streaming, diagram when complete, text for other languages", () => {
  assert.equal(codeBlockView("mermaid", "flowchart LR\nA-->B", false).kind, "code");
  assert.equal(codeBlockView("mermaid", "flowchart LR\nA-->B", true).kind, "diagram");
  assert.equal(codeBlockView("ts", "x", true).kind, "code");
  assert.equal(codeBlockView("", "x", true).label, "text");
});

/* -------------------------------------------------------------------------- */
/* Reasoning                                                                  */
/* -------------------------------------------------------------------------- */

function note(status: ChatMessage["status"], content: string): string {
  return renderToStaticMarkup(
    React.createElement(ReasoningNote, { parts: [{ type: "reasoning", text: "I **think** <b>so</b>" }], status, content }),
  );
}

test("reasoning is a details with the summary Reasoning, plain text inside", () => {
  const done = note("done", "The answer");
  assert.match(done, /<details[^>]*>/);
  assert.match(done, /<summary[^>]*>Reasoning<\/summary>/);
  assert.equal(/<details[^>]*\sopen/.test(done), false, "closed for a finished message");
  assert.match(done, /I \*\*think\*\* &lt;b&gt;so&lt;\/b&gt;/, "text, not markdown or markup");
});

test("reasoning is open while streaming with no answer text yet", () => {
  assert.match(note("streaming", ""), /<details[^>]*\sopen/);
  assert.equal(/<details[^>]*\sopen/.test(note("streaming", "Some text")), false);
});

test("no reasoning part, no note", () => {
  assert.equal(renderToStaticMarkup(React.createElement(ReasoningNote, { parts: [], status: "done", content: "x" })), "");
});

/* -------------------------------------------------------------------------- */
/* Feedback and edit & resend                                                 */
/* -------------------------------------------------------------------------- */

/** A port that answers every turn with `answer-<n>`, and records what it was asked. */
function recordingPort(asked: string[]): InferencePort {
  return {
    async complete() {
      return { content: "unused" };
    },
    async stream(request, onEvent) {
      asked.push(request.text);
      onEvent("text.delta", { text: `answer-${asked.length}` });
      onEvent("done", {});
    },
  };
}

test("feedback toggles up to none, and up to down", async () => {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();
  setInferencePort(recordingPort([]));
  const conversation = s().createConversation(null, { title: "Feedback" });
  await s().send(conversation.id, "hi");
  const answerId = s().messagesFor(conversation.id)[1].id;
  const feedback = () => s().messages.find((m) => m.id === answerId)?.feedback;

  s().setFeedback(answerId, "up");
  assert.equal(feedback(), "up");
  const stored = JSON.parse(globalThis.localStorage.getItem("osionos.chat.v1") ?? "{}") as { messages: ChatMessage[] };
  assert.equal(stored.messages.find((m) => m.id === answerId)?.feedback, "up", "persisted with the conversation");

  s().setFeedback(answerId, "down");
  assert.equal(feedback(), "down", "the other value replaces it");
  s().setFeedback(answerId, "down");
  assert.equal(feedback(), undefined, "the same value again clears it");
  assert.equal("feedback" in (s().messages.find((m) => m.id === answerId) ?? {}), false);
});

test("feedback survives a reload", async () => {
  shimLocalStorage();
  const first = await import("@/features/chat/model/useChatStore");
  first.setInferencePort(recordingPort([]));
  const conversation = first.useChatStore.getState().createConversation(null, { title: "Reload" });
  await first.useChatStore.getState().send(conversation.id, "hi");
  const answerId = first.useChatStore.getState().messagesFor(conversation.id)[1].id;
  first.useChatStore.getState().setFeedback(answerId, "up");

  const reloaded = (await import("@/features/chat/model/useChatStore.ts?reload")) as typeof first;
  assert.notEqual(reloaded.useChatStore, first.useChatStore, "a fresh module instance, loaded from storage");
  assert.equal(reloaded.useChatStore.getState().messages.find((m) => m.id === answerId)?.feedback, "up");
});

test("edit & resend drops the message and all after it, keeps the earlier ones, sends once", async () => {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();
  const asked: string[] = [];
  setInferencePort(recordingPort(asked));
  const conversation = s().createConversation(null, { title: "Edit" });
  const other = s().createConversation(null, { title: "Other" });
  await s().send(other.id, "elsewhere");
  await s().send(conversation.id, "first");
  await s().send(conversation.id, "second");
  await s().send(conversation.id, "third");
  asked.length = 0;

  const before = s().messagesFor(conversation.id);
  assert.equal(before.length, 6);
  const edited = before[2];
  assert.equal(edited.content, "second");

  assert.equal(await s().editAndResend(edited.id, "second, reworded"), true);

  const after = s().messagesFor(conversation.id);
  assert.deepEqual(after.slice(0, 2).map((m) => m.id), before.slice(0, 2).map((m) => m.id), "earlier messages kept");
  assert.equal(after.some((m) => m.id === edited.id || m.id === before[3].id || m.id === before[4].id || m.id === before[5].id), false);
  assert.deepEqual(after.slice(2).map((m) => [m.role, m.content]), [["user", "second, reworded"], ["assistant", "answer-1"]]);
  assert.deepEqual(asked, ["second, reworded"], "sent exactly once");
  assert.equal(s().messagesFor(other.id).length, 2, "another conversation is untouched");
});

test("edit & resend refuses a non-user message and empty text", async () => {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();
  const asked: string[] = [];
  setInferencePort(recordingPort(asked));
  const conversation = s().createConversation(null, { title: "Refuse" });
  await s().send(conversation.id, "hi");
  const [user, answer] = s().messagesFor(conversation.id);
  assert.equal(await s().editAndResend(answer.id, "x"), false);
  assert.equal(await s().editAndResend(user.id, "   "), false);
  assert.equal(s().messagesFor(conversation.id).length, 2);
});

test("message actions are real buttons with labels and pressed state", () => {
  const html = renderToStaticMarkup(
    React.createElement(AssistantActions, { content: "x", feedback: "up", onFeedback: () => undefined }),
  );
  assert.match(html, /<button type="button"[^>]*aria-label="Copy message"/);
  assert.match(html, /aria-label="Good answer"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*aria-label="Good answer"/);
  assert.match(html, /aria-label="Bad answer"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*aria-label="Bad answer"/);
});

/* -------------------------------------------------------------------------- */
/* Windowing                                                                  */
/* -------------------------------------------------------------------------- */

function windowed(total: number, initialPages: number): string {
  const items = Array.from({ length: total }, (_, index) => index);
  return renderToStaticMarkup(
    React.createElement(MessageWindow<number>, {
      items,
      initialPages,
      children: (visible: readonly number[]) => visible.map((n) => React.createElement("i", { key: n, "data-n": n })),
    }),
  );
}

test("130 messages show the last 60 and the button; one click shows 120", () => {
  assert.equal(MESSAGE_PAGE, 60);
  assert.equal(windowStart(130, 0), 70);
  assert.equal(windowStart(130, 1), 10);
  assert.equal(windowStart(130, 2), 0);
  assert.equal(windowStart(30, 0), 0);

  const first = windowed(130, 0);
  assert.equal(first.match(/<i /g)?.length, 60);
  assert.match(first, /data-n="129"/);
  assert.equal(first.includes('data-n="69"'), false);
  assert.match(first, /Show earlier messages/);

  const clicked = windowed(130, 1);
  assert.equal(clicked.match(/<i /g)?.length, 120);
  assert.match(clicked, /Show earlier messages/);
  assert.equal(windowed(130, 2).includes("Show earlier"), false);
});
