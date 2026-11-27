/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   agent-conversation-model.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


/**
 * The pure model behind the agent conversation page: block parsing, the page a
 * tool created, tool events and the stored settings.
 *
 * Pure logic only: no JSX, no server, no network. The storage reads run against a
 * stub localStorage that the test installs and removes.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { fallbackBlocksFromText, parseCreatedPageFromToolText, toBlock } from "@/widgets/agent-conversation/model/agentBlocks";
import { AGENT_SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS, readSettings } from "@/widgets/agent-conversation/model/agentStorage";
import { upsertToolEvent } from "@/widgets/agent-conversation/model/agentToolEvents";
import type { AgentToolEvent } from "@/widgets/agent-conversation/model/types";

type Slot = { window?: unknown; localStorage?: unknown };

/** Runs `body` with a stub localStorage holding `stored` under the settings key. */
function withStoredSettings(stored: string | null, body: () => void) {
  const slot = globalThis as unknown as Slot;
  const before = { window: slot.window, localStorage: slot.localStorage };
  slot.window = globalThis;
  slot.localStorage = { getItem: (key: string) => (key === AGENT_SETTINGS_STORAGE_KEY ? stored : null) };
  try {
    body();
  } finally {
    slot.window = before.window;
    slot.localStorage = before.localStorage;
  }
}

test("toBlock keeps a valid record, and drops an unknown type or a non-record", () => {
  const block = toBlock({ id: "b1", type: "to_do", content: "ship", checked: true, headingLevel: 2 });
  assert.deepEqual(block, { id: "b1", type: "to_do", content: "ship", checked: true, headingLevel: 2 });
  assert.equal(toBlock({ type: "not-a-block" }), null);
  assert.equal(toBlock("paragraph"), null);
  assert.equal(toBlock(null), null);
});

test("toBlock gives a record without an id or content a fresh id and empty content", () => {
  const block = toBlock({ type: "paragraph" });
  assert.match(block?.id ?? "", /^mcp-block-/);
  assert.equal(block?.content, "");
});

test("fallbackBlocksFromText makes one paragraph per non-empty line", () => {
  const blocks = fallbackBlocksFromText("one\r\n\ntwo\nthree");
  assert.deepEqual(blocks.map((block) => [block.type, block.content]), [["paragraph", "one"], ["paragraph", "two"], ["paragraph", "three"]]);
  assert.deepEqual(fallbackBlocksFromText(""), []);
});

test("parseCreatedPageFromToolText reads a created page, and answers null for anything else", () => {
  const hit = parseCreatedPageFromToolText(JSON.stringify({
    created: { id: 42 },
    page: { title: "Plan", content: [{ type: "heading_1", content: "Goals" }] },
  }));
  assert.equal(hit?.externalPageId, "42");
  assert.equal(hit?.title, "Plan");
  assert.deepEqual(hit?.content.map((block) => block.type), ["heading_1"]);

  assert.equal(parseCreatedPageFromToolText(JSON.stringify({ ok: true })), null);
  assert.equal(parseCreatedPageFromToolText("not json"), null);
});

test("parseCreatedPageFromToolText falls back to a default title and to the text as blocks", () => {
  const hit = parseCreatedPageFromToolText(JSON.stringify({ created: { id: "p9" } }));
  assert.equal(hit?.title, "Claude MCP page");
  assert.ok((hit?.content.length ?? 0) > 0);
});

test("upsertToolEvent appends a new id and replaces an existing one in place", () => {
  const running: AgentToolEvent = { id: "t1", name: "search", status: "running", detail: "Running search" };
  const other: AgentToolEvent = { id: "t2", name: "read", status: "running", detail: "Running read" };
  const appended = upsertToolEvent([running], other);
  assert.deepEqual(appended.map((event) => event.id), ["t1", "t2"]);
  const replaced = upsertToolEvent(appended, { ...running, status: "complete", detail: "done" });
  assert.deepEqual(replaced.map((event) => [event.id, event.status]), [["t1", "complete"], ["t2", "running"]]);
  assert.equal(upsertToolEvent(undefined, running).length, 1);
});

test("readSettings answers the defaults for corrupt JSON and for a page with none stored", () => {
  withStoredSettings("{not json", () => assert.deepEqual(readSettings("page-1"), DEFAULT_SETTINGS));
  withStoredSettings(null, () => assert.deepEqual(readSettings("page-1"), DEFAULT_SETTINGS));
  withStoredSettings(JSON.stringify({ "page-2": { model: "opus" } }), () => assert.deepEqual(readSettings("page-1"), DEFAULT_SETTINGS));
});

test("readSettings merges what a page stored over the defaults", () => {
  withStoredSettings(JSON.stringify({ "page-1": { model: "opus", effort: "high" } }), () => {
    assert.deepEqual(readSettings("page-1"), { ...DEFAULT_SETTINGS, model: "opus", effort: "high" });
  });
});
