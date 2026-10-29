/** The routing hub: the chain on this device, the run body, the `route` frame, the section. */

import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import "./support/memory-local-storage.ts";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { setAiTransport } from "@/features/ai/api/aiClient";
import type { AiConnection } from "@/features/ai/api/aiContract";
import { aiInferencePort } from "@/features/ai/model/aiInferencePort";
import {
  AI_FALLBACKS_STORAGE_KEY,
  readAiFallbacks,
  writeAiFallbacks,
  writeAiSelection,
} from "@/features/ai/model/aiSelection";
import { DEVICE_CONNECTION_ID } from "@/features/ai/model/deviceEngine";
import type { ChatMessage } from "@/features/chat/model/chatTypes";
import { dispatchRunEvent, type RunEventActions } from "@/features/chat/model/runEventDispatch";
import { RouteNote, routeNoteText } from "@/features/chat/ui/MessageActions";
import { HUB_SECTIONS } from "@/widgets/ai-hub/ui/hubSections";
import { HubSectionBody } from "@/widgets/ai-hub/ui/HubSectionBody";
import { RoutingEditor } from "@/widgets/ai-hub/ui/HubRoutingSection";

const A = { connectionId: "platform", model: "m-a" };
const B = { connectionId: "c-1", model: "m-b" };
const C = { connectionId: "c-2", model: "m-c" };

beforeEach(() => localStorage.clear());

/* ------------------------------ storage ---------------------------------- */

test("the chain round-trips", () => {
  writeAiFallbacks([A, B]);
  assert.deepEqual(readAiFallbacks(), [A, B]);
});

test("the chain holds at most two", () => {
  writeAiFallbacks([A, B, C]);
  assert.deepEqual(readAiFallbacks(), [A, B]);
});

test("the chain has no duplicates", () => {
  writeAiFallbacks([A, A, B]);
  assert.deepEqual(readAiFallbacks(), [A, B]);
});

test("the primary is not in its own chain", () => {
  writeAiFallbacks([A, B], undefined, A);
  assert.deepEqual(readAiFallbacks(undefined, A), [B]);
  localStorage.setItem(AI_FALLBACKS_STORAGE_KEY, JSON.stringify([A, B]));
  assert.deepEqual(readAiFallbacks(undefined, B), [A]);
});

test("a malformed value is no chain", () => {
  for (const raw of ["{", "42", "{\"a\":1}", "[null, 3, {\"model\":\"x\"}]"]) {
    localStorage.setItem(AI_FALLBACKS_STORAGE_KEY, raw);
    assert.deepEqual(readAiFallbacks(), [], raw);
  }
});

/* ----------------------------- the run body ------------------------------ */

/** Runs one stream through the real port and returns the JSON body of POST /runs. */
async function runBody(connectionId: string, model = "m-p"): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  setAiTransport(async (_url, init) => {
    body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return new Response("event: done\ndata: {}\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
  });
  await aiInferencePort.stream!(
    { connectorId: "ai", model, messages: [], text: "hi", connectionId, serverConversationId: "conv-1" },
    () => undefined,
  );
  return body;
}

test("a run carries the chain", async () => {
  writeAiFallbacks([B, C]);
  assert.deepEqual((await runBody("platform")).fallbacks, [B, C]);
});

test("a run without a chain has no fallbacks key (byte-identical, C262)", async () => {
  const body = await runBody("platform");
  assert.equal("fallbacks" in body, false);
  assert.equal(JSON.stringify(body).includes("fallbacks"), false);
});

test("a device run never sends the chain", async () => {
  writeAiFallbacks([B]);
  assert.equal("fallbacks" in (await runBody(DEVICE_CONNECTION_ID)), false);
});

/* ---------------------------- the route frame ----------------------------- */

test("the route frame records who answered and why", () => {
  const patches: Array<Partial<ChatMessage>> = [];
  const actions = { patchAssistant: (patch: Partial<ChatMessage>) => void patches.push(patch) } as unknown as RunEventActions;
  dispatchRunEvent("route", { from: "m-p", to: "m-b", reason: "rate_limited" }, actions);
  dispatchRunEvent("route", { from: "m-p", to: "m-c", reason: "odd" }, actions);
  dispatchRunEvent("route", { from: "m-p" }, actions);
  assert.deepEqual(patches, [
    { answeredBy: "m-b", routeReason: "rate_limited" },
    { answeredBy: "m-c", routeReason: "unavailable" },
  ]);
});

test("the line names both models and the reason", () => {
  assert.equal(routeNoteText("openai/gpt-a", "claude-b", "rate_limited"), "Answered by claude-b — gpt-a was busy");
  assert.equal(routeNoteText("gpt-a", "claude-b", "upstream_error"), "Answered by claude-b — gpt-a was unavailable");
  const html = renderToStaticMarkup(React.createElement(RouteNote, { primary: "gpt-a", answeredBy: "claude-b", reason: "unavailable" }));
  assert.match(html, /data-testid="route-note"[^>]*>Answered by claude-b — gpt-a was unavailable</);
});

/* ------------------------------ the section ------------------------------- */

const CONNECTIONS = [
  { id: "platform", label: "Platform" },
  { id: "c-1", label: "My key" },
] as AiConnection[];
const MODELS = { platform: [{ id: "m-a", label: "Model A", default: true }], "c-1": [{ id: "m-b", label: "Model B", default: true }] };

function editor(primary: typeof A, chain: typeof A[]) {
  return renderToStaticMarkup(
    React.createElement(RoutingEditor, {
      primary, connections: CONNECTIONS, models: MODELS, chain,
      onChange: () => undefined, onRemove: () => undefined, onAdd: () => undefined,
    }),
  );
}

test("Routing is a Hub section right after Connections", () => {
  const ids = HUB_SECTIONS.map((section) => section.id);
  assert.equal(ids.indexOf("routing"), ids.indexOf("connections") + 1);
  assert.equal(HUB_SECTIONS.find((section) => section.id === "routing")?.label, "Routing");
});

test("the section says so when the build has no AI service", () => {
  const html = renderToStaticMarkup(React.createElement(HubSectionBody, { id: "routing" }));
  assert.ok(html.includes("The AI service is not configured on this build"));
});

test("two saved fallbacks: two picker pairs, add is disabled", () => {
  const html = editor(B, [A, C]);
  assert.equal((html.match(/>Remove</g) ?? []).length, 2);
  assert.match(html, /Fallback 1/);
  assert.match(html, /Fallback 2/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Add a fallback<\/button>/);
});

test("one saved fallback: add is enabled", () => {
  assert.doesNotMatch(editor(B, [A]), /disabled=""[^>]*>Add a fallback/);
});

test("the privacy note shows only for a platform fallback behind a private primary", () => {
  assert.match(editor(B, [A]), /If your model fails, this message goes to OpenRouter instead/);
  assert.doesNotMatch(editor(A, [B]), /OpenRouter/);
  assert.doesNotMatch(editor(B, []), /OpenRouter/);
});

test("the primary is read-only and says where it is chosen", () => {
  writeAiSelection(B);
  assert.match(editor(B, []), /Chosen in the composer/);
});

test("a model with a future cooldownUntil shows when it stops resting; a past one shows nothing", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const until = new Date(now + 90_000);
  const clock = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(until);
  const render = (cooldownUntil: string) =>
    renderToStaticMarkup(
      React.createElement(RoutingEditor, {
        primary: B, connections: CONNECTIONS, now,
        models: { ...MODELS, "c-1": [{ id: "m-b", label: "B", default: true, cooldownUntil }] },
        chain: [B],
        onChange: () => undefined, onRemove: () => undefined, onAdd: () => undefined,
      }),
    );
  assert.match(render(until.toISOString()), new RegExp(`resting until ${clock}`));
  assert.doesNotMatch(render(new Date(now - 1000).toISOString()), /resting until/);
});
