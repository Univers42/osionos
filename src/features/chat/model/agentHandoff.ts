/**
 * Which agent answered, and the hand-off a view tool suggests.
 *
 * The service stores the agent of every answer, and its `suggest_agent` view
 * tool offers the user another built-in agent for the question. The client
 * keeps the offer on the message as a part and only SHOWS it: nothing is asked
 * of the other agent until the user presses the button.
 *
 * Pure logic, no React: the chip lives in ui/AgentHandoffChip.tsx.
 *
 * Caveat: the offer is live only. The service stores no view, so an answer
 * reloaded from the transcript has no chip. A custom agent is never offered,
 * and an id the agents list does not hold (not loaded yet, deleted) shows none.
 */

import type { AgentSummary } from "@/features/ai/model/aiAgents";
import type { ChatMessage, ChatMessagePart } from "./chatTypes";

/** The name of an answer's author when its agent is unknown or deleted. */
export const DEFAULT_AGENT_NAME = "Assistant";

/** The service's bound on a reason; a longer one is not the service's. */
const REASON_MAX = 200;

export interface HandoffPart {
  type: "agent-handoff";
  agentId: string;
  reason: string;
}

/** The name an answer is shown under: its agent's, or "Assistant". */
export function agentName(agentId: string | undefined, agents: readonly AgentSummary[]): string {
  return agents.find((agent) => agent.id === agentId)?.name ?? DEFAULT_AGENT_NAME;
}

/** The agents a user may ask instead: not the author of the answer, not an archived one. */
export function otherAgents(agents: readonly AgentSummary[], answeredBy: string | undefined): AgentSummary[] {
  return agents.filter((agent) => agent.id !== answeredBy && (agent.kind !== "custom" || (!agent.archived && !agent.needsReview)));
}

/** The part of a `suggest_agent` view; null for any other view or a malformed one. */
export function handoffFromView(view: unknown): HandoffPart | null {
  if (typeof view !== "object" || view === null) return null;
  const { action, agentId, reason } = view as Record<string, unknown>;
  if (action !== "suggest_agent" || typeof agentId !== "string" || agentId === "") return null;
  if (typeof reason !== "string") return null;
  return { type: "agent-handoff", agentId, reason };
}

/** The parts with the offer added; the same agent is never offered twice. */
export function withHandoff(parts: ChatMessagePart[], handoff: HandoffPart): ChatMessagePart[] {
  const known = parts.some((part) => part.type === "agent-handoff" && part.agentId === handoff.agentId);
  return known ? parts : [...parts, handoff];
}

/** The chip an answer shows: the first offer that names a known built-in agent and gives a reason. */
export function handoffFromParts(
  parts: ChatMessagePart[] | undefined,
  agents: readonly AgentSummary[],
): { agent: AgentSummary; reason: string } | null {
  for (const part of parts ?? []) {
    if (part.type !== "agent-handoff") continue;
    const agent = agents.find((one) => one.id === part.agentId && one.kind !== "custom");
    const reason = part.reason.trim();
    if (agent && reason !== "" && reason.length <= REASON_MAX) return { agent, reason };
  }
  return null;
}

/** The user question an answer answers: the nearest user turn before it. */
export function questionBefore(messages: readonly ChatMessage[], index: number): string | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (messages[cursor].role === "user") return messages[cursor].content;
  }
  return null;
}
