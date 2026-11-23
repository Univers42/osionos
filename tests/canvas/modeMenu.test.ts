// The assist-mode menu (AM10 UI): four options and no bypass, the anchor rule,
// the flag, and what each refusal of the service turns into.

import assert from "node:assert/strict";
import test from "node:test";

import "./support/memory-local-storage.ts";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { setAiTransport } from "@/features/ai/api/aiClient";
import { getMode, modeFeedback, patchMode } from "@/features/chat/model/assistMode";
import { isFeatureFlagEnabled } from "@/shared/config/featureFlags";
import { ChatComposer } from "@/widgets/chat-shell/ui/ChatComposer";
import { ModeMenu } from "@/widgets/chat-shell/ui/ModeMenu";

const PAGE = "11111111-1111-4111-8111-111111111111";
const render = (openPageId: string | null, value: "manual" | "plan" | "accept_edits" | "auto" = "manual") =>
  renderToStaticMarkup(React.createElement(ModeMenu, { conversationId: "c1", openPageId, value, onChange: () => undefined }));

test("the menu offers the four modes in order and never says bypass", () => {
  const html = render(PAGE);
  const values = [...html.matchAll(/<option[^>]*value="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(values, ["manual", "plan", "accept_edits", "auto"]);
  assert.doesNotMatch(html, /bypass/i);
  assert.match(html, /aria-label="Assistant mode"/);
});

test("accept_edits is disabled with a hint while no page is open", () => {
  const closed = render(null);
  assert.match(closed, /<option[^>]*value="accept_edits"[^>]*disabled/);
  assert.match(closed, /Open a page to use it as the anchor/);
  const open = render(PAGE);
  assert.doesNotMatch(open, /disabled=/);
  assert.doesNotMatch(open, /Open a page to use it as the anchor/);
});

test("the flag is off by default and the composer draws no menu", () => {
  assert.equal(isFeatureFlagEnabled("osio.ai.modes"), false);
  const html = renderToStaticMarkup(
    React.createElement(ChatComposer, {
      value: "", onChange: () => undefined, onSubmit: () => undefined, onConnect: () => undefined,
      selection: { connectionId: "platform", model: "" }, onSelectionChange: () => undefined,
      chips: [], onChipsChange: () => undefined,
    }),
  );
  assert.doesNotMatch(html, /Assistant mode/);
});

test("each refusal of the service becomes a code and a sentence", async () => {
  const answer = (status: number, error: string) => setAiTransport(async () => Response.json({ error }, { status }));
  const cases: Array<[number, string, string]> = [
    [403, "reauth_required", "reauth_required"],
    [403, "modes_not_enabled", "modes_not_enabled"],
    [404, "not_found", "modes_not_enabled"],
    [422, "anchor_invalid", "anchor_invalid"],
    [500, "boom", "error"],
  ];
  for (const [status, error, code] of cases) {
    answer(status, error);
    assert.deepEqual(await patchMode("c1", { mode: "auto" }), { ok: false, code });
  }
  assert.equal(modeFeedback("reauth_required").error, "Sign in again to allow automatic edits");
  assert.equal(modeFeedback("modes_not_enabled").hidden, true);
  assert.equal(modeFeedback("anchor_invalid").hidden, false);
});

test("patchMode sends only the schema's keys and getMode reads the stored mode", async () => {
  let sent: { method?: string; url: string; body: string } = { url: "", body: "" };
  setAiTransport(async (url, init) => {
    sent = { method: init?.method, url: String(url), body: String(init?.body ?? "") };
    return Response.json({ mode: "accept_edits", anchorPageId: PAGE });
  });
  assert.deepEqual(await patchMode("c1", { mode: "accept_edits", anchorPageId: PAGE }), { ok: true });
  assert.equal(sent.method, "PATCH");
  assert.match(sent.url, /\/api\/ai\/conversations\/c1\/mode$/);
  assert.deepEqual(JSON.parse(sent.body), { mode: "accept_edits", anchorPageId: PAGE });
  assert.deepEqual(await getMode("c1"), { mode: "accept_edits", anchorPageId: PAGE });
});
