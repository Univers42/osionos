/** The AI Hub's "Context & privacy": every claim is pinned to the service line that makes it true. */

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AiConnection, AiProvider } from "@/features/ai/api/aiContract";
import { outgoingContext, recipientOf } from "@/features/ai/model/outgoingContext";
import { HubPrivacySection } from "@/widgets/ai-hub/ui/HubPrivacySection";
import { HubSectionBody } from "@/widgets/ai-hub/ui/HubSectionBody";

const PLATFORM = { connectionId: "platform", model: "auto" };
const rowOf = (accountContext: boolean, id: string, selection = PLATFORM) =>
  outgoingContext({ accountContext, selection }).find((row) => row.id === id)!;

// message: services/osionos-ai/src/runs/prompt.ts:76 (loadHistory, 24 000 chars, :50) and :105
// (historyMessages) put the earlier turns in the call; runs/upstream.ts:227-228 sends them with the question.
test("the message row is always sent, with or without account context", () => {
  assert.equal(rowOf(true, "message").sent, true);
  assert.equal(rowOf(false, "message").sent, true);
  assert.match(rowOf(true, "message").detail, /earlier messages/);
});

// account: runs/runner.ts:325 builds the account block (prompt.ts:294: name, username, pronouns,
// timezone, workspace, role) and :329-330 the workspace block (prompt.ts:348: page titles), only when the
// client sends `account` (runs/runner.ts:113). The client sends it only when the setting is on:
// src/features/ai/model/viewContext.ts:144. The view block (prompt.ts:313: route, page, tabs, panel) is
// built at runner.ts:334 from `view`, which the same function sets.
test("account context on: the account row is sent", () => {
  const row = rowOf(true, "account");
  assert.equal(row.sent, true);
  assert.match(row.detail, /name.*workspace.*role.*tabs.*titles of the pages/);
});

test("account context off: the account row is not sent, the message still is", () => {
  assert.equal(rowOf(false, "account").sent, false);
  assert.equal(rowOf(false, "message").sent, true);
});

// pages: runs/prompt.ts:223 (pageBlock) quotes the text of each context page; the client lists them in
// src/features/ai/model/aiContext.ts:90 (buildRunContext). Only what the reader adds.
// search: routes/runs.ts:174 searches the workspace only when context.workspace is true, and runner.ts:157-165
// runs retrieve() only then (or for an agent's packs); the system prompt (prompt.ts:25) also lets the model
// call search_workspace. A device run always asks osionos for sources: src/features/ai/model/deviceInferencePort.ts:75.
// memories: runner.ts:317 loads approved memories (memory/runMemories.ts:21 approvedForRun), prompt.ts:250.
// files: runner.ts:287 fitFiles and prompt.ts:231 fileBlock for text; runner.ts:268 pushes images.
test("pages, search, memories and files leave only when supplied", () => {
  for (const id of ["pages", "search", "memories", "files"]) {
    const row = rowOf(true, id);
    assert.equal(row.sent, true, id);
    assert.equal(row.conditional, true, id);
  }
  assert.match(rowOf(true, "search").detail, /when you add the workspace/);
  assert.match(rowOf(true, "memories").detail, /approved/);
});

// device: deviceInferencePort.ts:63-69 (buildMessages) sends the engine a system line, the sources and the
// last question (lastUserText :55) and nothing else: no history, account, pages, memories or files.
test("a device run sends the engine only the last question and the found sources", () => {
  const device = { connectionId: "device", model: "m" };
  assert.match(rowOf(true, "message", device).detail, /latest message only/i);
  for (const id of ["account", "pages", "memories", "files"]) assert.equal(rowOf(true, id, device).sent, false, id);
  const search = rowOf(true, "search", device);
  assert.equal(search.sent, true);
  assert.equal(search.conditional, false);
});

// platform: runs/effort.ts:47 ("The platform is OpenRouter") and gateway/platform.ts:27-33 (one
// OpenAI-compatible upstream, OpenRouter's headers). The upstream URL is deployment config
// (config.ts:444), so the wording is OpenRouter as the brief and effort.ts name it.
const connection = (extra: Partial<AiConnection>): AiConnection => ({
  id: "c1", kind: "api_key", provider: "anthropic", label: "Mine", status: "ok", createdAt: "", ...extra,
});
const providers: AiProvider[] = [{ id: "anthropic", name: "Anthropic", kind: "api_key", supported: true, modelCount: 3 }];

test("the recipient: platform, a user connection, this device", () => {
  assert.equal(recipientOf(PLATFORM, [], []).text, "osionos sends this to OpenRouter, which routes it to the model's provider");
  assert.equal(recipientOf(null, [], []).kind, "platform");
  // runs/upstream.ts and gateway/resolve.ts:221 (platformBudget: false): a user connection is paid by the user.
  assert.equal(
    recipientOf({ connectionId: "c1", model: "m" }, [connection({})], providers).text,
    "Sent to Anthropic with your key",
  );
  assert.match(
    recipientOf({ connectionId: "c2", model: "m" }, [connection({ id: "c2", kind: "endpoint", baseUrl: "http://x.test/v1" })], providers).text,
    /Sent to your endpoint http:\/\/x\.test\/v1 with your key/,
  );
  assert.equal(recipientOf({ connectionId: "gone", model: "m" }, [], []).kind, "platform");
  assert.match(recipientOf({ connectionId: "device", model: "m" }, [], []).text, /^Stays on this device/);
});

test("the section markup: recipient, every row label, and the toggle", () => {
  const html = renderToStaticMarkup(React.createElement(HubPrivacySection));
  assert.ok(html.includes("osionos sends this to OpenRouter"));
  for (const label of [
    "Your message and this conversation", "Account context", "Pages you add with @",
    "Search results from your workspace", "Approved memories", "Attached files and images",
  ]) assert.ok(html.includes(label), label);
  assert.match(html, /aria-label="Account context"/);
  assert.match(html, /data-testid="outgoing-account"[^>]*>Sent</);
  assert.ok(!html.includes("Meeting notes auto-record"), "no-op switches are not in the Hub");
});

test("the Hub's privacy section renders the new section", () => {
  const html = renderToStaticMarkup(React.createElement(HubSectionBody, { id: "privacy" }));
  assert.ok(html.includes("What your next message sends"));
});
