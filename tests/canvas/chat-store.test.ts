/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   chat-store.test.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { stubInferencePort } from "@/features/chat/model/inferencePort";

function shimLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
}

test("inference stub: returns a visibly-fake message echoing connector + model", async () => {
  const result = await stubInferencePort.complete({ connectorId: "anthropic", model: "claude-opus-4-8", messages: [] });
  assert.match(result.content, /^\[stub\] connector=anthropic model=claude-opus-4-8/);
  assert.match(result.content, /inference not wired in Phase 1/);
});

test("chat store: create conversation, send → user + stub assistant turns, projects CRUD", async () => {
  shimLocalStorage();
  const { useChatStore } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();

  const conversation = s().createConversation(null, { title: "First" });
  assert.equal(s().activeConversationId, conversation.id);

  await s().send(conversation.id, "hello", { connectorId: "anthropic", model: "auto" });
  const messages = s().messagesFor(conversation.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "user");
  assert.equal(messages[0].content, "hello");
  assert.equal(messages[1].role, "assistant");
  assert.match(messages[1].content, /\[stub\] connector=anthropic model=auto/);

  // Projects: create + reassign on delete.
  const project = s().createProject("My project");
  assert.ok(s().projects.find((p) => p.id === project.id));
  s().deleteProject(project.id);
  assert.equal(s().projects.find((p) => p.id === project.id), undefined);

  // Shared context: attach + list + detach at conversation scope.
  s().attachContext("conversation", conversation.id, { kind: "page", label: "Spec" });
  assert.equal(s().contextFor("conversation", conversation.id).length, 1);
  const ctxId = s().contextFor("conversation", conversation.id)[0].id;
  s().detachContext(ctxId);
  assert.equal(s().contextFor("conversation", conversation.id).length, 0);

  // Persisted (the shim captured the write).
  const raw = globalThis.localStorage.getItem("osionos.chat.v1");
  assert.ok(raw && raw.includes(conversation.id));
});
