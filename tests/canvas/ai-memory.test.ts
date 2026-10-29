/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-memory.test.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * AI memory in the app: the contract parsers, the caps and refusals in words,
 * the `memory.proposed` frame, and the chip that shows a proposal as text.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  groupMemories,
  memoryErrorMessage,
  MEMORY_BODY_MAX,
  parseMemories,
  validateMemoryBody,
  type AiMemory,
} from "@/features/ai/model/memories";
import type { ChatMessagePart } from "@/features/chat/model/chatTypes";
import { memoryProposalsFromParts, withMemoryDecision, type MemoryProposalPart } from "@/features/chat/model/memoryParts";
import { dispatchRunEvent, type RunEventActions } from "@/features/chat/model/runEventDispatch";
import { MemoryProposalChip } from "@/features/chat/ui/MemoryProposalChip";

const ID_1 = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-8222-222222222222";

const memory = (over: Partial<AiMemory> = {}): AiMemory => ({
  id: ID_1,
  workspaceId: "w1",
  body: "prefers short answers",
  status: "proposed",
  version: 1,
  updatedAt: "2026-10-23T10:00:00.000Z",
  ...over,
});

test("parseMemories drops malformed items and keeps good ones", () => {
  const good = memory();
  const parsed = parseMemories([
    good,
    null,
    "text",
    { ...good, status: "deleted" },
    { ...good, id: 5 },
    { ...good, body: undefined },
    { ...good, version: "1" },
    memory({ id: ID_2, status: "approved" }),
  ]);
  assert.deepEqual(parsed.map((m) => m.id), [ID_1, ID_2]);
  assert.deepEqual(parseMemories("nope"), []);
});

test("groupMemories splits by status and orders by updatedAt", () => {
  const grouped = groupMemories([
    memory({ id: "a", updatedAt: "2026-10-23T09:00:00.000Z" }),
    memory({ id: "b", updatedAt: "2026-10-23T11:00:00.000Z" }),
    memory({ id: "c", status: "approved", updatedAt: "2026-10-22T09:00:00.000Z" }),
    memory({ id: "d", status: "approved", updatedAt: "2026-10-22T12:00:00.000Z" }),
    memory({ id: "e", status: "archived" }),
  ]);
  assert.deepEqual(grouped.proposed.map((m) => m.id), ["b", "a"]);
  assert.deepEqual(grouped.approved.map((m) => m.id), ["d", "c"]);
});

test("validateMemoryBody trims and enforces the cap", () => {
  assert.deepEqual(validateMemoryBody(""), { ok: false, message: "Write something to remember." });
  assert.deepEqual(validateMemoryBody("  \n\t "), { ok: false, message: "Write something to remember." });
  assert.deepEqual(validateMemoryBody(`  ${"a".repeat(MEMORY_BODY_MAX)}  `), { ok: true, body: "a".repeat(MEMORY_BODY_MAX) });
  assert.deepEqual(validateMemoryBody("a".repeat(MEMORY_BODY_MAX + 1)), { ok: false, message: "At most 300 characters." });
  assert.equal(MEMORY_BODY_MAX, 300);
});

test("memoryErrorMessage: one sentence per refusal", () => {
  assert.equal(memoryErrorMessage(404, "not_found"), "This memory no longer exists.");
  assert.equal(memoryErrorMessage(409, "too_many_approved"), "You already have 50 approved memories here. Archive one first.");
  assert.equal(memoryErrorMessage(409, "wrong_state"), "This memory changed. Refresh the list.");
  assert.equal(memoryErrorMessage(400, "empty"), "Write something to remember.");
  assert.equal(memoryErrorMessage(400, "too_long"), "At most 300 characters.");
  assert.equal(memoryErrorMessage(500, "internal"), "Could not save. Try again.");
  assert.equal(memoryErrorMessage(undefined, undefined), "Could not save. Try again.");
});

function dispatchSeen(data: Record<string, unknown>): MemoryProposalPart[] {
  const seen: MemoryProposalPart[] = [];
  const actions = { proposeMemory: (part: MemoryProposalPart) => void seen.push(part) } as unknown as RunEventActions;
  dispatchRunEvent("memory.proposed", data, actions);
  return seen;
}

test("a memory.proposed frame calls proposeMemory; a bad frame calls nothing", () => {
  assert.deepEqual(dispatchSeen({ type: "memory.proposed", id: ID_1, body: "likes tea" }), [
    { type: "memory-proposal", memoryId: ID_1, body: "likes tea" },
  ]);
  assert.equal(dispatchSeen({ id: ID_1, body: "a".repeat(MEMORY_BODY_MAX) }).length, 1);
  assert.deepEqual(dispatchSeen({ id: ID_1 }), []);
  assert.deepEqual(dispatchSeen({ id: ID_1, body: "" }), []);
  assert.deepEqual(dispatchSeen({ id: "not-a-uuid", body: "x" }), []);
  assert.deepEqual(dispatchSeen({ id: 7, body: "x" }), []);
  assert.deepEqual(dispatchSeen({ id: ID_1, body: "a".repeat(MEMORY_BODY_MAX + 1) }), []);
});

test("withMemoryDecision changes only the matching part", () => {
  const parts: ChatMessagePart[] = [
    { type: "memory-proposal", memoryId: ID_1, body: "one" },
    { type: "memory-proposal", memoryId: ID_2, body: "two" },
  ];
  const next = withMemoryDecision(parts, ID_2, "approved");
  assert.deepEqual(memoryProposalsFromParts(next).map((p) => p.decision), [undefined, "approved"]);
  assert.equal(next[0], parts[0], "the other part is the same object");
  assert.equal(parts[1].type === "memory-proposal" && parts[1].decision, undefined, "the input is untouched");
});

test("the chip shows a hostile body as text, never as an element", () => {
  const hostile = "<img src=x onerror=alert(1)>";
  const html = renderToStaticMarkup(
    React.createElement(MemoryProposalChip, {
      proposal: { type: "memory-proposal", memoryId: ID_1, body: hostile },
      onDecided: () => undefined,
    }),
  );
  assert.doesNotMatch(html, /<img/i, "the payload is never an element");
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/, "the payload is escaped text");
  assert.match(html, /Remember this\?/);
  assert.match(html, /aria-label="Approve: &lt;img src=x onerror=alert\(1\)&gt;"/);
  const decided = renderToStaticMarkup(
    React.createElement(MemoryProposalChip, {
      proposal: { type: "memory-proposal", memoryId: ID_1, body: "x", decision: "approved" },
      onDecided: () => undefined,
    }),
  );
  assert.match(decided, /Remembered/);
  assert.doesNotMatch(decided, /<button/, "a decided chip has no buttons");
});
