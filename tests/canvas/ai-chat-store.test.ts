/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-chat-store.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The chat store with a streaming port: the assistant turn grows as the frames
 * arrive, ends on done, fails with a code, and a conversation speaks once.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { InferencePort, InferenceEventData } from "@/features/chat/model/inferencePort";

function shimLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: () => null,
    length: 0,
  };
}

/** A port that answers with the frames it is given, one after the other. */
function fakePort(frames: Array<[string, InferenceEventData]>, hold?: Promise<void>): InferencePort {
  return {
    async complete() {
      return { content: "[fake] complete" };
    },
    async stream(request, onEvent) {
      for (const [event, data] of frames) onEvent(event, data);
      if (hold) await hold;
    },
  };
}

test("the store streams an answer: the deltas accumulate, then done", async () => {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();

  setInferencePort(
    fakePort([
      ["run.started", { runId: "run-1" }],
      ["text.delta", { text: "Hel" }],
      ["text.delta", { text: "lo" }],
      ["done", { runId: "run-1" }],
    ]),
  );

  const conversation = s().createConversation(null, { title: "Streamed" });
  await s().send(conversation.id, "hello");

  const messages = s().messagesFor(conversation.id);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "user");
  assert.equal(messages[0].content, "hello");
  assert.equal(messages[1].role, "assistant");
  assert.equal(messages[1].content, "Hello", "the deltas are appended in order");
  assert.equal(messages[1].status, "done");
  assert.equal(messages[1].runId, "run-1", "the run id comes from the service");
});

test("the store remembers the server-side conversation", async () => {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();

  const port: InferencePort = {
    async complete() {
      return { content: "[fake] complete" };
    },
    async stream(request, onEvent) {
      request.onServerConversationId?.("server-conv-1");
      onEvent("done", {});
    },
  };
  setInferencePort(port);

  const conversation = s().createConversation(null, { title: "Remembered" });
  await s().send(conversation.id, "hello");

  const stored = s().conversations.find((c) => c.id === conversation.id);
  assert.equal(stored?.serverConversationId, "server-conv-1");
});

test("an error frame fails the answer with its code", async () => {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();

  setInferencePort(
    fakePort([
      ["text.delta", { text: "Hel" }],
      ["error", { code: "upstream_error", message: "the provider is down" }],
    ]),
  );

  const conversation = s().createConversation(null, { title: "Failed" });
  await s().send(conversation.id, "hello");

  const assistant = s().messagesFor(conversation.id)[1];
  assert.equal(assistant.status, "error");
  assert.equal(assistant.errorCode, "upstream_error");
});

test("a second send while a run is streaming is refused", async () => {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();

  let release: () => void = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  setInferencePort(fakePort([["text.delta", { text: "Hel" }]], hold));

  const conversation = s().createConversation(null, { title: "Once" });
  const first = s().send(conversation.id, "one");
  await s().send(conversation.id, "two");
  release();
  await first;

  const messages = s().messagesFor(conversation.id);
  const users = messages.filter((m) => m.role === "user");
  assert.equal(users.length, 1, "the second send is refused");
  assert.equal(users[0].content, "one");
  assert.equal(messages.length, 2, "one user turn, one assistant turn");
});
