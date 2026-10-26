/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ai-bots-client.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+       */
/*                                                +#+#+#+#+#+   +#+           */
/*    Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#            */
/*    Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr      */
/*                                                                            */
/* ************************************************************************** */

// Bots in the chat: an answer names its agent, a view tool may offer a hand-off
// (a chip, never an action), and a panel of agents is asked in turn.

import assert from "node:assert/strict";
import test from "node:test";

import { messageFromWire } from "@/features/ai/api/aiWire";
import type { AiMessage } from "@/features/ai/api/aiContract";
import type { AgentSummary } from "@/features/ai/model/aiAgents";
import type { ChatMessage, ChatMessagePart } from "@/features/chat/model/chatTypes";
import { chatMessageFromTranscript } from "@/features/chat/model/transcriptMessages";
import {
  agentName,
  handoffFromParts,
  handoffFromView,
  otherAgents,
  questionBefore,
  withHandoff,
} from "@/features/chat/model/agentHandoff";
import { dispatchRunEvent, type RunEventActions } from "@/features/chat/model/runEventDispatch";
import { challengeText, panelTurns, runPanel, togglePanelMember } from "@/features/chat/model/agentPanel";

const CUSTOM = "3f0c2b9e-5a41-4c1e-9d63-0a8f6f1b7c22";
const agents = [
  { id: "db-architect", name: "Database architect", description: "", version: 1 },
  { id: "analyst", name: "Analyst", description: "", version: 1 },
  { id: "doc-writer", name: "Doc writer", description: "", version: 1 },
  { kind: "custom", id: CUSTOM, name: "Mine", description: "", scope: "user", workspaceId: null, tools: [], skills: [], version: 1, archived: false, needsReview: false },
] as AgentSummary[];

const row = (over: Partial<AiMessage>): AiMessage => ({
  id: "m", conversationId: "c", runId: "r1", role: "assistant",
  parts: [{ type: "text", text: "hi" }], createdAt: "2026-10-26T10:00:00Z", ...over,
});

/* ---- 1. every stored answer names its agent ----------------------------- */

test("a wire row keeps agent_id; a row without one stays without", () => {
  const wire = { id: "m", conversation_id: "c", run_id: "r", role: "assistant", parts: [], model: null, created_at: "x" } as const;
  assert.equal(messageFromWire({ ...wire, agent_id: "analyst" }).agentId, "analyst");
  assert.equal("agentId" in messageFromWire({ ...wire, agent_id: null }), false);
});

test("a transcript answer carries its agent, a user turn never does", () => {
  const answer = chatMessageFromTranscript(row({ agentId: "analyst" }), "L1", "id1");
  assert.equal(answer.agentId, "analyst");
  assert.equal(answer.content, "hi");
  assert.equal(answer.status, "done");
  assert.equal("agentId" in chatMessageFromTranscript(row({ role: "user", agentId: "analyst" }), "L1", "id2"), false);
  assert.equal("agentId" in chatMessageFromTranscript(row({}), "L1", "id3"), false);
});

test("a name resolves from the agents list; unknown or deleted reads Assistant", () => {
  assert.equal(agentName("analyst", agents), "Analyst");
  assert.equal(agentName(CUSTOM, agents), "Mine");
  assert.equal(agentName("gone-agent", agents), "Assistant");
  assert.equal(agentName(undefined, agents), "Assistant");
});

/* ---- 2. the hand-off chip ----------------------------------------------- */

const offer = (agentId: string, reason: string): ChatMessagePart => ({ type: "agent-handoff", agentId, reason });

test("the extractor gives the first valid offer", () => {
  const found = handoffFromParts([offer("analyst", "numbers"), offer("doc-writer", "prose")], agents);
  assert.equal(found?.agent.id, "analyst");
  assert.equal(found?.reason, "numbers");
});

test("an unknown agent, a custom agent, or a missing reason gives no chip", () => {
  assert.equal(handoffFromParts([offer("nobody", "why")], agents), null);
  assert.equal(handoffFromParts([offer(CUSTOM, "why")], agents), null);
  assert.equal(handoffFromParts([offer("analyst", "   ")], agents), null);
  assert.equal(handoffFromParts(undefined, agents), null);
});

test("an invalid first offer is skipped for a valid second one; the same agent is never offered twice", () => {
  assert.equal(handoffFromParts([offer("nobody", "x"), offer("analyst", "y")], agents)?.agent.id, "analyst");
  const once = withHandoff([], { type: "agent-handoff", agentId: "analyst", reason: "a" });
  assert.equal(withHandoff(once, { type: "agent-handoff", agentId: "analyst", reason: "b" }), once);
});

test("handoffFromView reads only a well-formed suggest_agent view", () => {
  assert.deepEqual(handoffFromView({ action: "suggest_agent", agentId: "analyst", reason: "r" }), offer("analyst", "r"));
  assert.equal(handoffFromView({ action: "open_page", agentId: "analyst", reason: "r" }), null);
  assert.equal(handoffFromView({ action: "suggest_agent", agentId: "analyst" }), null);
  assert.equal(handoffFromView(null), null);
});

function recorder() {
  const offers: string[] = [];
  const actions = {
    appendToolResult: () => undefined,
    suggestAgent: (handoff: { agentId: string }) => void offers.push(handoff.agentId),
  } as unknown as RunEventActions;
  return { offers, actions };
}

test("a suggest_agent result becomes an offer; a failed one offers nothing", () => {
  const { offers, actions } = recorder();
  const view = { action: "suggest_agent", agentId: "analyst", reason: "numbers" };
  dispatchRunEvent("tool.result", { toolCallId: "t1", toolName: "suggest_agent", ok: true, view }, actions);
  dispatchRunEvent("tool.result", { toolCallId: "t2", toolName: "suggest_agent", ok: false, view }, actions);
  assert.deepEqual(offers, ["analyst"]);
});

test("the question of an answer is the nearest user turn before it", () => {
  const msg = (role: ChatMessage["role"], content: string) => ({ role, content }) as ChatMessage;
  const thread = [msg("user", "q1"), msg("assistant", "a1"), msg("user", "q2"), msg("assistant", "a2")];
  assert.equal(questionBefore(thread, 3), "q2");
  assert.equal(questionBefore(thread, 1), "q1");
  assert.equal(questionBefore(thread, 0), null);
});

/* ---- 3. ask another agent ----------------------------------------------- */

test("the agents to ask instead leave out the one that answered and the archived ones", () => {
  const archived = { ...agents[3], id: "old", archived: true } as AgentSummary;
  assert.deepEqual(otherAgents([...agents, archived], "analyst").map((a) => a.id), ["db-architect", "doc-writer", CUSTOM]);
  assert.equal(otherAgents(agents, undefined).length, agents.length);
});

/* ---- 4. a panel of agents ----------------------------------------------- */

test("a panel's turns: the first answers the text, the next are asked to add or challenge", () => {
  const turns = panelTurns([agents[0], agents[1], agents[2]], "Design a schema");
  assert.deepEqual(turns, [
    { text: "Design a schema", agentId: "db-architect" },
    { text: "Analyst, what would you add or challenge?", agentId: "analyst" },
    { text: "Doc writer, what would you add or challenge?", agentId: "doc-writer" },
  ]);
  assert.equal(challengeText("X"), "X, what would you add or challenge?");
  assert.equal(panelTurns(agents, "q").length, 3);
});

test("a panel holds at most three agents, in the order picked", () => {
  assert.deepEqual(togglePanelMember(["b", "a"], "c"), ["b", "a", "c"]);
  assert.deepEqual(togglePanelMember(["a", "b", "c"], "d"), ["a", "b", "c"]);
  assert.deepEqual(togglePanelMember(["a", "b"], "a"), ["b"]);
});

test("the runner sends the turns one after the other, each after the previous one ended", async () => {
  const log: string[] = [];
  const turns = panelTurns(agents.slice(0, 3), "q");
  const ran = await runPanel(turns, async (turn) => {
    log.push(`start:${turn.agentId}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    log.push(`end:${turn.agentId}`);
    return true;
  });
  assert.equal(ran, 3);
  assert.deepEqual(log, ["start:db-architect", "end:db-architect", "start:analyst", "end:analyst", "start:doc-writer", "end:doc-writer"]);
});

test("a failed turn, a throw, or a cancel stops the panel", async () => {
  const turns = panelTurns(agents.slice(0, 3), "q");
  const seen: string[] = [];
  assert.equal(await runPanel(turns, async (t) => { seen.push(t.agentId); return t.agentId !== "analyst"; }), 2);
  assert.deepEqual(seen, ["db-architect", "analyst"]);
  assert.equal(await runPanel(turns, async () => { throw new Error("boom"); }), 1);
  let cancelled = false;
  assert.equal(await runPanel(turns, async () => { cancelled = true; return true; }, () => cancelled), 1);
});
