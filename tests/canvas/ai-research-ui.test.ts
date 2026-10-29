/**
 * Research mode in the client (h2 verdict C402, C409–C412, C414): the toggle
 * and its disclosure, the run body, the progress card, the page a report
 * becomes, and the read-back after a resume gap.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { setAiTransport } from "@/features/ai/api/aiClient";
import type { AiMessage } from "@/features/ai/api/aiContract";
import { buildRunContext } from "@/features/ai/model/aiContext";
import { aiInferencePort } from "@/features/ai/model/aiInferencePort";
import { loadWebView, RESEARCH_DISCLOSURE } from "@/features/ai/model/webSettings";
import { useWebToggle } from "@/features/ai/model/webToggle";
import type { ChatMessage, ChatMessagePart } from "@/features/chat/model/chatTypes";
import { setConversationApi } from "@/features/chat/model/conversationApi";
import type { InferencePort } from "@/features/chat/model/inferencePort";
import {
  researchFromParts,
  researchLine,
  researchPage,
  textAfterGap,
  withoutImages,
  withResearch,
  type ResearchFrame,
} from "@/features/chat/model/researchParts";
import { dispatchRunEvent, type RunEventActions } from "@/features/chat/model/runEventDispatch";
import type { Citation } from "@/features/chat/model/citations";
import { ResearchCard } from "@/features/chat/ui/ResearchCard";
import { parseMarkdownClipboard } from "@/services/page-actions/blockClipboardSerialize";
import { ResearchToggleView } from "@/widgets/chat-shell/ui/WebToggle";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/* ------------------------------ the toggle ------------------------------- */

test("C414 the toggle says what research costs, only once pressed", () => {
  const off = renderToStaticMarkup(React.createElement(ResearchToggleView, { pressed: false, onPress() {} }));
  assert.match(off, /aria-pressed="false"/);
  assert.equal(off.includes(RESEARCH_DISCLOSURE), false);
  const on = renderToStaticMarkup(React.createElement(ResearchToggleView, { pressed: true, onPress() {} }));
  assert.match(on, /aria-pressed="true"/);
  assert.ok(on.includes("Research reads up to 24 web pages and takes a few minutes."));
});

test("C414 research presses the web, releasing the web releases research, a send takes both", () => {
  const toggle = () => useWebToggle.getState();
  toggle().setResearch(true);
  assert.deepEqual({ web: toggle().pressed, research: toggle().research }, { web: true, research: true });
  toggle().set(false);
  assert.equal(toggle().research, false);
  toggle().setResearch(true);
  assert.deepEqual(toggle().takeAll(), { web: true, research: true });
  assert.deepEqual(toggle().takeAll(), { web: false, research: false });
});

test("C414 research is offered only when the settings say so", async () => {
  setAiTransport(async () => json(200, { enabled: true, research: true }));
  assert.deepEqual(await loadWebView("ws"), { status: "ready", enabled: true, research: true });
  setAiTransport(async () => json(200, { enabled: true }));
  assert.deepEqual(await loadWebView("ws"), { status: "ready", enabled: true });
});

/* ------------------------------- the body -------------------------------- */

async function runBody(context: Parameters<typeof buildRunContext>): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  setAiTransport(async (_url, init) => {
    body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response("event: done\ndata: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
  });
  await aiInferencePort.stream!(
    { connectorId: "ai", model: "m", text: "hi", connectionId: "platform", serverConversationId: "conv-1", context: buildRunContext(...context) },
    () => undefined,
  );
  return body;
}

test("C396 a research send is mode research with the web on; research never rides in the context", async () => {
  const body = await runBody([[], false, true]);
  assert.equal(body.mode, "research");
  assert.deepEqual(body.context, { pageIds: [], workspace: false, web: true });
});

test("C415 a chat send is byte-identical: no mode key", async () => {
  const body = await runBody([[], true]);
  assert.equal("mode" in body, false);
  assert.deepEqual(body.context, { pageIds: [], workspace: false, web: true });
});

/* ------------------------------- the card -------------------------------- */

function recorder() {
  const frames: ResearchFrame[] = [];
  const patches: Partial<ChatMessage>[] = [];
  const actions = {
    noteResearch: (frame: ResearchFrame) => void frames.push(frame),
    patchAssistant: (patch: Partial<ChatMessage>) => void patches.push(patch),
  } as unknown as RunEventActions;
  return { frames, patches, actions };
}

test("C412 the plan and the progress frames reach the card; a malformed one is ignored", () => {
  const { frames, actions } = recorder();
  dispatchRunEvent("research.plan", { queries: ["zebra routes", 3, ""] }, actions);
  dispatchRunEvent("research.progress", { step: 2, maxSteps: 12, searches: 1, fetches: 0, phase: "search" }, actions);
  dispatchRunEvent("research.progress", { step: 2, maxSteps: 12, phase: "dance" }, actions);
  dispatchRunEvent("research.progress", { step: -1, maxSteps: 12, phase: "read" }, actions);
  assert.deepEqual(frames, [
    { queries: ["zebra routes"] },
    { step: 2, maxSteps: 12, searches: 1, fetches: 0, phase: "search" },
  ]);
});

test("C412 every frame folds into ONE part", () => {
  let parts: ChatMessagePart[] = [{ type: "text", text: "x" } as ChatMessagePart];
  parts = withResearch(parts, { queries: ["a", "b"] });
  parts = withResearch(parts, { step: 1, maxSteps: 12, searches: 0, fetches: 0, phase: "plan" });
  parts = withResearch(parts, { step: 5, maxSteps: 12, searches: 3, fetches: 4, phase: "read" });
  assert.equal(parts.filter((part) => part.type === "research").length, 1);
  const part = researchFromParts(parts);
  assert.deepEqual(part, { type: "research", step: 5, maxSteps: 12, searches: 3, fetches: 4, phase: "read", queries: ["a", "b"] });
  assert.equal(researchLine(part!, false), "Reading pages · step 5 of 12 · 3 searches, 4 pages read");
  assert.equal(researchLine(part!, true), "Research done · 3 searches, 4 pages read");
});

test("C412 C409 the card shows progress while running and Save as page only when done", () => {
  const part = researchFromParts(withResearch([], { step: 3, maxSteps: 12, searches: 1, fetches: 1, phase: "read" }))!;
  const running = renderToStaticMarkup(React.createElement(ResearchCard, { part, finished: false, onSave: async () => ({ ok: true as const }) }));
  assert.match(running, /<progress[^>]*value="3"[^>]*max="12"/);
  assert.equal(running.includes("research-save"), false);
  const done = renderToStaticMarkup(React.createElement(ResearchCard, { part, finished: true, onSave: async () => ({ ok: true as const }) }));
  assert.equal(done.includes("<progress"), false);
  assert.ok(done.includes("Save as page"));
  const noText = renderToStaticMarkup(React.createElement(ResearchCard, { part, finished: true }));
  assert.equal(noText.includes("research-save"), false);
});

/* ------------------------------- the page -------------------------------- */

const WEB = (n: number, title: string, url: string, domain: string): Citation => ({ collection: "web", n, url, domain, title, snippet: "" });

const REPORT = [
  "# Zebra migration",
  "",
  "Zebras walk 500 km [1]. Rains drive them [2]. A claim with no source [9].",
  "",
  "![map](https://evil.example/pixel.png)",
  "",
  "Inline ![tracker](https://evil.example/t.gif) and a ref ![x][img] and <img src=https://evil.example/a.png>.",
].join("\n");

const CITED = [
  WEB(1, "Serengeti [guide]", "https://parks.example/zebra (2024)", "parks.example"),
  WEB(2, "Rain study", "https://science.example/rain", "science.example"),
  WEB(2, "Rain study again", "https://science.example/rain2", "science.example"),
  { collection: "page", n: 3, pageId: "p-1", title: "My notes", snippet: "" } as Citation,
];

function allBlocks(blocks: ReturnType<typeof parseMarkdownClipboard>): Array<{ type: string; content?: string }> {
  return blocks.flatMap((block) => [block, ...allBlocks((block as { children?: typeof blocks }).children ?? [])]);
}

test("C410 no image survives: neither a block nor a markdown or HTML image", () => {
  assert.equal(withoutImages("a ![x](u) b ![y][r] c <IMG src=u>"), "a x b y c ");
  const { markdown } = researchPage(REPORT, "how do zebras migrate", CITED);
  const blocks = allBlocks(parseMarkdownClipboard(markdown));
  assert.equal(blocks.some((block) => block.type === "image"), false);
  assert.equal(/!\[|<img|evil\.example/i.test(markdown), false);
});

test("C410 C411 the title is the report's heading, said once; the sources are the run's, each once", () => {
  const { title, markdown } = researchPage(REPORT, "how do zebras migrate", CITED);
  assert.equal(title, "Zebra migration");
  assert.equal(markdown.startsWith("# Zebra"), false);
  assert.ok(markdown.includes("A claim with no source [9]."), "an [n] with no source stays plain text");
  const sources = markdown.slice(markdown.indexOf("## Sources"));
  assert.deepEqual(sources.split("\n").filter((line) => line.startsWith("- ")), [
    "- (1) [Serengeti guide](https://parks.example/zebra%20%282024%29) — parks.example",
    "- (2) [Rain study](https://science.example/rain) — science.example",
    "- (3) My notes",
  ]);
  assert.equal(sources.includes("(9)"), false);
});

test("C409 without a heading the title is the question; without either, a plain name", () => {
  assert.equal(researchPage("Text only.", "  why   is the sky blue ", []).title, "Research: why is the sky blue");
  assert.equal(researchPage("Text only.", null, []).title, "Research report");
  assert.equal(researchPage("Text only.", null, []).markdown, "Text only.");
});

/* ------------------------------ the gap read ----------------------------- */

const row = (runId: string, role: AiMessage["role"], text: string): AiMessage => ({
  id: `${runId}-${role}`, conversationId: "s-1", runId, role, parts: [{ type: "text", text }], createdAt: "2026-10-26T00:00:00Z",
});

test("C402 the text after a gap is the transcript's message of the same run", () => {
  const rows = [{ runId: "r1", role: "assistant", text: "old" }, { runId: "r2", role: "user", text: "q" }, { runId: "r2", role: "assistant", text: "full" }];
  assert.equal(textAfterGap("r2", rows), "full");
  assert.equal(textAfterGap("r3", rows), null);
});

test("C402 a resume.gap frame makes the store read the answer back at the end", async () => {
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const port: InferencePort = {
    async complete() {
      return { content: "" };
    },
    async stream(request, onEvent) {
      request.onServerConversationId?.("s-1");
      onEvent("run.started", { runId: "r2" });
      onEvent("text.delta", { text: "The rep" });
      onEvent("resume.gap", {});
      onEvent("text.delta", { text: "ort ends." });
      onEvent("done", {});
    },
  };
  setInferencePort(port);
  const reads: string[] = [];
  setConversationApi({
    isConfigured: () => true,
    transcript: async (id) => {
      reads.push(id);
      return { messages: [row("r2", "user", "q"), row("r2", "assistant", "The report, in full, ends.")], summary: null };
    },
  });
  try {
    const conversation = useChatStore.getState().createConversation(null, { title: "Gap" });
    await useChatStore.getState().send(conversation.id, "q");
    const answer = useChatStore.getState().messagesFor(conversation.id).find((m) => m.role === "assistant");
    assert.deepEqual(reads, ["s-1"]);
    assert.equal(answer?.content, "The report, in full, ends.");
    assert.equal(answer?.textGap, undefined);
  } finally {
    setConversationApi();
  }
});
