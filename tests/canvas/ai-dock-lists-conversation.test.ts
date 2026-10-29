/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-dock-lists-conversation.test.ts                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #84: a conversation started in the dock lived only in the dock's own state, so it never
// showed under Conversations → AI. Once the service has made it, the dock lists it with the
// account's conversations, under the title the service gave it.

import "./support/memory-local-storage.ts";
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import type { InferencePort } from "@/features/chat/model/inferencePort";
import { setConversationApi } from "@/features/chat/model/conversationApi";
import { useChatStore } from "@/features/chat/model/useChatStore";
import { runAiDockTurn } from "@/widgets/contact-dock/model/aiDockModel";

const SERVER_ID = "srv-dock-1";
let listedWorkspaces: string[] = [];

/** A streaming port that makes the server conversation on the first turn only. */
function portMaking(serverId: string): InferencePort {
  return {
    complete: async () => ({ content: "" }),
    stream: async (request, onEvent) => {
      if (!request.serverConversationId) request.onServerConversationId?.(serverId);
      onEvent("text.delta", { text: "42" });
      onEvent("done", {});
    },
  };
}

/** The store's work after the turn resolves: the account list is read off the turn's path. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  listedWorkspaces = [];
  useChatStore.setState({ conversations: [], messages: [], activeConversationId: null });
  setConversationApi({
    isConfigured: () => true,
    list: async (workspaceId) => {
      listedWorkspaces.push(workspaceId);
      return [{ id: SERVER_ID, workspaceId, title: "Q3 numbers", createdAt: "2026-10-30T10:00:00Z", updatedAt: "2026-10-30T10:00:00Z" }];
    },
  });
});

test("the dock's first turn lists its conversation under the service's title", async () => {
  await runAiDockTurn({ port: portMaking(SERVER_ID), conversationId: "dock-1", workspaceId: "w1", text: "Q3?", onDelta: () => undefined });
  await settle();
  const listed = useChatStore.getState().conversations.map((c) => [c.serverConversationId, c.title]);
  assert.deepEqual(listed, [[SERVER_ID, "Q3 numbers"]]);
  assert.deepEqual(listedWorkspaces, ["w1"]);
});

test("a later turn of the same dock conversation reads the list no more", async () => {
  await runAiDockTurn({
    port: portMaking(SERVER_ID), conversationId: "dock-1", workspaceId: "w1", serverConversationId: SERVER_ID, text: "And Q4?", onDelta: () => undefined,
  });
  await settle();
  assert.deepEqual(listedWorkspaces, []);
});

test("the dock makes its conversation in the workspace it lists", async () => {
  const asked: (string | undefined)[] = [];
  const port = portMaking(SERVER_ID);
  const stream = port.stream!;
  port.stream = (request, onEvent, signal) => { asked.push(request.workspaceId); return stream(request, onEvent, signal); };
  await runAiDockTurn({ port, conversationId: "dock-2", workspaceId: "w1", text: "Q3?", onDelta: () => undefined });
  assert.deepEqual(asked, ["w1"]);
});
