import assert from "node:assert/strict";
import test from "node:test";

import type { ChatMessage, Conversation } from "@/features/chat/model/chatTypes";
import { greetingFor } from "@/shared/lib/date/greeting";
import { agentInitials, agentTint, groupConversations, STARTER_GROUPS } from "@/widgets/chat-shell/model/brainHome";
import { activitiesOf, sourcesOf } from "@/widgets/chat-shell/model/conversationTrail";

const conversation = (id: string, updatedAt: string): Conversation => ({
  id,
  projectId: null,
  title: id,
  createdAt: updatedAt,
  updatedAt,
});

test("the greeting follows the local hour", () => {
  assert.equal(greetingFor(3), "Up late");
  assert.equal(greetingFor(9), "Good morning");
  assert.equal(greetingFor(14), "Good afternoon");
  assert.equal(greetingFor(21), "Good evening");
});

test("the history is cut into calendar-day spans, newest first, empty spans left out", () => {
  const now = new Date(2026, 9, 26, 9, 0);
  const groups = groupConversations(
    [
      conversation("last-night", new Date(2026, 9, 25, 23, 50).toISOString()),
      conversation("this-morning", new Date(2026, 9, 26, 8, 0).toISOString()),
      conversation("earlier-today", new Date(2026, 9, 26, 0, 10).toISOString()),
      conversation("last-week", new Date(2026, 9, 21, 12, 0).toISOString()),
      conversation("last-year", new Date(2025, 9, 26, 12, 0).toISOString()),
      conversation("broken", "not a date"),
    ],
    now,
  );
  assert.deepEqual(
    groups.map((group) => [group.label, group.conversations.map((c) => c.id)]),
    [
      ["Today", ["this-morning", "earlier-today"]],
      ["Yesterday", ["last-night"]],
      ["Previous 7 days", ["last-week"]],
      ["Older", ["last-year", "broken"]],
    ],
  );
});

test("an agent keeps its colour and gets at most two initials", () => {
  assert.deepEqual(agentTint("doc-writer"), agentTint("doc-writer"));
  assert.match(agentTint("analyst").background, /^var\(--osio-block-tint-[a-z]+-bg\)$/);
  assert.equal(agentInitials("Doc writer"), "DW");
  assert.equal(agentInitials("  analyst "), "A");
  assert.equal(agentInitials("Database schema architect"), "DS");
  assert.equal(agentInitials(""), "?");
});

test("every starter has a title and a prompt to finish", () => {
  for (const group of STARTER_GROUPS) {
    assert.ok(group.starters.length > 0, group.label);
    for (const starter of group.starters) assert.ok(starter.title && starter.prompt, starter.title);
  }
});

const answer = (id: string, parts: unknown[]): ChatMessage => ({
  id,
  conversationId: "c",
  role: "assistant",
  content: "",
  createdAt: "2026-10-26T09:00:00.000Z",
  parts: parts as ChatMessage["parts"],
});

test("the sources of a conversation are listed once each, with the number of answers that cited them", () => {
  const messages: ChatMessage[] = [
    answer("a1", [
      { type: "citation", n: 1, pageId: "p1", title: "Roadmap", snippet: "Q4" },
      { type: "citation", n: 2, pageId: "p1", blockId: "b9", title: "Roadmap", snippet: "Q4 again" },
      { type: "citation", n: 3, collection: "pack", pack: "acid-basics", title: "ACID", snippet: "" },
    ]),
    { id: "u1", conversationId: "c", role: "user", content: "and?", createdAt: "2026-10-26T09:01:00.000Z" },
    answer("a2", [{ type: "citation", n: 1, pageId: "p1", title: "Roadmap", snippet: "Q4" }]),
  ];
  assert.deepEqual(
    sourcesOf(messages).map((source) => [source.key, source.answers]),
    [["page:p1", 2], ["pack:acid-basics:ACID", 1]],
  );
});

test("the activity of a conversation keeps every tool call in order, with its answer", () => {
  const messages: ChatMessage[] = [
    answer("a1", [{ type: "tool-activity", toolCallId: "t1", toolName: "search_workspace", label: "roadmap", status: "done", count: 3 }]),
    answer("a2", [{ type: "tool-activity", toolCallId: "t2", toolName: "read_page", label: "Roadmap", status: "running" }]),
  ];
  assert.deepEqual(
    activitiesOf(messages).map((entry) => [entry.messageId, entry.activity.toolCallId]),
    [["a1", "t1"], ["a2", "t2"]],
  );
});
