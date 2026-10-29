/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   library-item-detail.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 18:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

// A skill, agent or command row opens a dialog with the item as the AI service
// serves it; a page or database row is not one of these and opens as before.

import assert from "node:assert/strict";
import test from "node:test";

import { libraryItemRef, loadLibraryItemDetail, type LibraryItemClient } from "@/widgets/database-view/model/libraryItemDetail";

const client = (overrides: Partial<LibraryItemClient> = {}): LibraryItemClient => ({
  listCommands: async () => [{ name: "summarize", description: "Sum it up", template: "Summarize {{selection}}", surface: "chat" }],
  listAgents: async () => [
    { id: "analyst", version: 1, name: "Analyst", description: "Reads data" },
    { kind: "custom", id: "a1", scope: "user", workspaceId: null, name: "Mine", description: "My helper", tools: [], skills: [], version: 1, archived: false, needsReview: false },
  ],
  getAgent: async (id) => ({
    kind: "custom", id, scope: "user", workspaceId: null, name: "Mine", description: "My helper",
    tools: [], skills: [], version: 1, archived: false, needsReview: false, instructions: "Be brief.",
  }),
  listWorkspaceSkills: async () => [
    { id: "s1", slug: "tone", name: "Tone", description: "House tone", body: "Write plainly.", version: 1, updatedAt: "", inIndex: true },
  ],
  ...overrides,
});

test("only skill, agent and command row ids are AI items", () => {
  assert.deepEqual(libraryItemRef("command:summarize"), { kind: "command", key: "summarize" });
  assert.deepEqual(libraryItemRef("skill:s1"), { kind: "skill", key: "s1" });
  assert.deepEqual(libraryItemRef("agent:a1"), { kind: "agent", key: "a1" });
  assert.equal(libraryItemRef("page-123"), null);
  assert.equal(libraryItemRef("command:"), null);
});

test("a command shows its description and template", async () => {
  const detail = await loadLibraryItemDetail({ kind: "command", key: "summarize" }, "ws", client());
  assert.deepEqual(detail, {
    title: "/summarize", label: "Command", description: "Sum it up", body: { label: "Template", text: "Summarize {{selection}}" },
  });
});

test("a skill is read from the active workspace; with none it is missing", async () => {
  const detail = await loadLibraryItemDetail({ kind: "skill", key: "s1" }, "ws", client());
  assert.equal(detail?.body?.text, "Write plainly.");
  assert.equal(await loadLibraryItemDetail({ kind: "skill", key: "s1" }, undefined, client()), null);
});

test("a built-in agent shows its description; a custom one its instructions", async () => {
  let fetched = 0;
  const counting = client({ getAgent: async (id) => { fetched += 1; return client().getAgent(id); } });
  const builtin = await loadLibraryItemDetail({ kind: "agent", key: "analyst" }, "ws", counting);
  assert.deepEqual(builtin, { title: "Analyst", label: "Built-in agent", description: "Reads data" });
  assert.equal(fetched, 0);
  const custom = await loadLibraryItemDetail({ kind: "agent", key: "a1" }, "ws", counting);
  assert.equal(custom?.label, "Your agent");
  assert.equal(custom?.body?.text, "Be brief.");
});

test("an item the service no longer has is missing, not an error", async () => {
  assert.equal(await loadLibraryItemDetail({ kind: "command", key: "gone" }, "ws", client()), null);
  assert.equal(await loadLibraryItemDetail({ kind: "agent", key: "gone" }, "ws", client()), null);
});
