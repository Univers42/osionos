/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-wire.test.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The conversation routes answer with database rows; these are the rows the
// service sends (repo.ts columns through JSON.stringify), read as the contract.

import assert from "node:assert/strict";
import test from "node:test";

import { conversationFromWire, messageFromWire } from "@/features/ai/api/aiWire";

const asJson = <T>(row: Record<string, unknown>): T => JSON.parse(JSON.stringify(row)) as T;

const conversationRow = (id: string, updated: string) => asJson<Parameters<typeof conversationFromWire>[0]>({
  id, owner_id: "u1", workspace_id: "w1", title: "Chat", model: null,
  created_at: new Date("2026-10-01T10:00:00Z"), updated_at: new Date(updated), archived_at: null,
});

test("a conversation row reads as the contract, and sorts by updatedAt", () => {
  const rows = [conversationRow("a", "2026-10-02T10:00:00Z"), conversationRow("b", "2026-10-03T10:00:00Z")];
  const conversations = rows.map(conversationFromWire);
  assert.deepEqual(conversations[0], {
    id: "a", workspaceId: "w1", title: "Chat",
    createdAt: "2026-10-01T10:00:00.000Z", updatedAt: "2026-10-02T10:00:00.000Z",
  });
  const newestFirst = [...conversations].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  assert.deepEqual(newestFirst.map((c) => c.id), ["b", "a"]);
});

test("a message row reads as the contract; a missing run and parts read empty", () => {
  const message = messageFromWire(asJson({
    id: "m1", conversation_id: "c1", run_id: null, role: "user", parts: null,
    model: "m", usage: null, created_at: new Date("2026-10-01T10:00:00Z"),
  }));
  assert.deepEqual(message, {
    id: "m1", conversationId: "c1", runId: "", role: "user", parts: [], model: "m",
    createdAt: "2026-10-01T10:00:00.000Z",
  });
});
