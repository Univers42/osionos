/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-agents.test.ts                                  :+:      :+:    :+:   */
/*                                                    :+: :+:         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The agent of a message: the "@db-architect " the reader starts with.
 *
 * The prefix picks the agent for that message, and it is stripped before the
 * text is sent. An "@word" the service does not know is text, and a mention in
 * the middle of a sentence is text too.
 *
 * Pure logic only: no JSX, no server, no network.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { agentName, parseAgentPrefix, type AgentSummary } from "@/features/ai/model/aiAgents";
import type { InferencePort, StreamInferenceRequest } from "@/features/chat/model/inferencePort";

/* -------------------------------------------------------------------------- */
/* The agents the service offers                                               */
/* -------------------------------------------------------------------------- */

const AGENTS: AgentSummary[] = [
  { id: "db-architect", version: 1, name: "Database architect", description: "Schema design." },
  { id: "doc-writer", version: 1, name: "Doc writer", description: "Concise documentation." },
  { id: "analyst", version: 1, name: "Analyst", description: "The numbers and their source." },
];

/* -------------------------------------------------------------------------- */
/* The prefix                                                                  */
/* -------------------------------------------------------------------------- */

test("the prefix picks the agent, and it is stripped", () => {
  const choice = parseAgentPrefix("@db-architect design a table for the orders", AGENTS);
  assert.equal(choice.agentId, "db-architect");
  assert.equal(choice.text, "design a table for the orders");
});

test("a message without a prefix is the message, and no agent", () => {
  const choice = parseAgentPrefix("design a table for the orders", AGENTS);
  assert.equal(choice.agentId, null);
  assert.equal(choice.text, "design a table for the orders");
});

test("an @word the service does not know stays in the text", () => {
  const choice = parseAgentPrefix("@nope hello there", AGENTS);
  assert.equal(choice.agentId, null);
  assert.equal(choice.text, "@nope hello there");
});

test("a mention in the middle is not a selector", () => {
  const choice = parseAgentPrefix("ask @db-architect about the orders", AGENTS);
  assert.equal(choice.agentId, null);
  assert.equal(choice.text, "ask @db-architect about the orders");
});

test("the prefix needs a space after it", () => {
  const choice = parseAgentPrefix("@db-architect", AGENTS);
  assert.equal(choice.agentId, null);
  assert.equal(choice.text, "@db-architect");
});

test("the name of an agent is the name the reader sees", () => {
  assert.equal(agentName(AGENTS, "db-architect"), "Database architect");
  assert.equal(agentName(AGENTS, null), null);
  assert.equal(agentName(AGENTS, "nope"), null);
});

/* -------------------------------------------------------------------------- */
/* The run                                                                     */
/* -------------------------------------------------------------------------- */

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

test("the agent of the message rides the run, and the prefix is not sent", async () => {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();

  let sent: StreamInferenceRequest | null = null;
  const port: InferencePort = {
    async complete() {
      return { content: "[fake] complete" };
    },
    async stream(request, onEvent) {
      sent = request;
      onEvent("text.delta", { text: "ok" });
      onEvent("done", {});
    },
  };
  setInferencePort(port);
  useChatStore.setState({ agents: AGENTS });

  const conversation = s().createConversation(null, { title: "With an agent" });
  await s().send(conversation.id, "@db-architect design a table");

  assert.equal(sent?.agentId, "db-architect", "the run carries the agent");
  assert.equal(sent?.text, "design a table", "and not the prefix");

  const messages = s().messagesFor(conversation.id);
  assert.equal(messages[0].content, "design a table");
  assert.equal(messages[0].agentId, "db-architect");
  assert.equal(messages[1].agentId, "db-architect", "the answer carries it too");
});

test("a message that names no agent is the run of today", async () => {
  shimLocalStorage();
  const { useChatStore, setInferencePort } = await import("@/features/chat/model/useChatStore");
  const s = () => useChatStore.getState();

  let sent: StreamInferenceRequest | null = null;
  const port: InferencePort = {
    async complete() {
      return { content: "[fake] complete" };
    },
    async stream(request, onEvent) {
      sent = request;
      onEvent("done", {});
    },
  };
  setInferencePort(port);
  useChatStore.setState({ agents: AGENTS });

  const conversation = s().createConversation(null, { title: "No agent" });
  await s().send(conversation.id, "hello there");

  assert.equal(sent?.agentId, undefined, "no agent on the run");
  assert.equal(s().messagesFor(conversation.id)[0].agentId, undefined);
});
