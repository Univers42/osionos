/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiAgents.ts                                        :+:      :+:    :+:   */
/*                                                    :+: :+:         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The agents of a run: the shape the assistant takes for one message.
 *
 * The list comes from the service (`GET /api/ai/agents`) and the browser
 * holds nothing but the name of an agent: the instructions are the text of the
 * server's prompt.
 *
 * A message that STARTS with `@<agent-id> ` picks that agent for that
 * message, and the prefix is stripped before the text is sent. A mention in
 * the middle is text, and an `@word` the service does not know is text too.
 *
 * Pure logic: no React, no store. The composer and the store share it.
 */

import type { AiAgent } from "@/features/ai/api/aiContract";

/** An agent of the service, as the client knows it. */
export type AgentSummary = AiAgent;

/** The prefix of a message that picks an agent: `@db-architect `. */
const AGENT_PREFIX = /^@([A-Za-z0-9_-]+)[ \t]+/;

/** What a message asks for: the agent, and the text that is left. */
export interface AgentChoice {
  /** The agent of the message, or none. */
  agentId: string | null;
  /** The text of the message, without the prefix. */
  text: string;
}

/**
 * The agent a message names, and the text without the prefix.
 *
 * The prefix must be at the very start of the message and must be followed by
 * a space: `@db-architect design a table` picks the Database architect,
 * `@db-architect` alone is the mention of a word, and `ask @db-architect` is
 * a sentence that happens to hold a mention.
 *
 * An id the service does not know is left in the text: the reader wrote
 * something, and the service never saw that id.
 */
export function parseAgentPrefix(text: string, agents: readonly AgentSummary[]): AgentChoice {
  const match = AGENT_PREFIX.exec(text);
  if (!match) return { agentId: null, text };
  const id = match[1];
  // A custom agent is picked by click, never by prefix: its id is a uuid.
  if (!agents.some((agent) => agent.kind !== "custom" && agent.id === id)) return { agentId: null, text };
  return { agentId: id, text: text.slice(match[0].length) };
}

/** The name of an agent, or null when the list does not hold it. */
export function agentName(agents: readonly AgentSummary[], id: string | null): string | null {
  if (!id) return null;
  return agents.find((agent) => agent.id === id)?.name ?? null;
}
