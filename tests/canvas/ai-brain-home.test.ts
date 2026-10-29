import assert from "node:assert/strict";
import test from "node:test";

import type { ChatMessage, Conversation } from "@/features/chat/model/chatTypes";
import { greetingFor } from "@/shared/lib/date/greeting";
import { agentInitials, agentTint, groupConversations, STARTER_GROUPS } from "@/widgets/chat-shell/model/brainHome";
import { activitiesOf, sourcesOf } from "@/widgets/chat-shell/model/conversationTrail";
import { brainLayout, paneSize, togglePanel, toggleRail } from "@/widgets/chat-shell/model/brainLayout";

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

test("the chat list and the context panel sit beside the chat while it keeps its width, and slide over it below", () => {
  assert.deepEqual([paneSize(600), paneSize(1000), paneSize(1400)], ["narrow", "medium", "wide"]);
  assert.deepEqual(brainLayout(1400, null, null), { railOpen: true, railOverlay: false, panelOpen: true, panelOverlay: false });
  assert.deepEqual(brainLayout(1000, null, null), { railOpen: true, railOverlay: false, panelOpen: false, panelOverlay: true });
  assert.deepEqual(brainLayout(600, null, null), { railOpen: false, railOverlay: true, panelOpen: false, panelOverlay: true });
  const listShut = brainLayout(1000, { open: false, size: "medium" }, { open: true, size: "medium" });
  assert.equal(listShut.panelOverlay, false, "with the list shut, the panel fits beside the chat");
});

test("a choice holds while the pane keeps its size; resized past it, the width decides again", () => {
  const openedWide = { open: true, size: "wide" } as const;
  assert.equal(brainLayout(1300, null, { open: false, size: "wide" }).panelOpen, false, "shut on a wide pane stays shut");
  assert.equal(brainLayout(600, null, openedWide).panelOpen, false, "a panel opened wide does not cover a narrow pane");
});

test("opening one side folds the other away when only one fits beside the chat, never when both fit", () => {
  const crowded = brainLayout(1000, null, null);
  assert.deepEqual(togglePanel(1000, crowded), { rail: { open: false, size: "medium" }, panel: { open: true, size: "medium" } }, "the panel does not cover the answer");
  const panelBeside = brainLayout(1000, { open: false, size: "medium" }, { open: true, size: "medium" });
  assert.deepEqual(toggleRail(1000, panelBeside), { rail: { open: true, size: "medium" }, panel: { open: false, size: "medium" } });
  const wide = brainLayout(1400, null, { open: false, size: "wide" });
  assert.deepEqual(togglePanel(1400, wide), { panel: { open: true, size: "wide" } }, "room for both: the list stays");
  assert.deepEqual(togglePanel(600, brainLayout(600, null, null)), { panel: { open: true, size: "narrow" } }, "too narrow for either: the panel slides over");
  assert.deepEqual(togglePanel(1000, brainLayout(1000, null, { open: true, size: "medium" })), { panel: { open: false, size: "medium" } }, "shutting never moves the other side");
});
