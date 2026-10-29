/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   libraryItemDetail.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 18:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

/**
 * What opening a skill, agent or command row shows: the item as the AI
 * service serves it, read when the row opens. Nothing of it is kept in the
 * Library state; the rows carry names only.
 */

import type { AiAgent, AiCommand, AiCustomAgent } from "@/features/ai/api/aiContract";
import { getAgent, listAgents, listCommands, listWorkspaceSkills, type AiWorkspaceSkill } from "@/features/ai/api/aiClient";
import { AGENT_ROW_PREFIX, COMMAND_ROW_PREFIX, SKILL_ROW_PREFIX } from "./libraryDatabaseModel";

export type LibraryItemKind = "skill" | "agent" | "command";
export interface LibraryItemRef { kind: LibraryItemKind; key: string }

export interface LibraryItemDetail {
  title: string;
  label: string;
  description: string;
  body?: { label: string; text: string };
}

export interface LibraryItemClient {
  listCommands: () => Promise<AiCommand[]>;
  listAgents: () => Promise<AiAgent[]>;
  getAgent: (id: string) => Promise<AiCustomAgent>;
  listWorkspaceSkills: (workspaceId: string) => Promise<AiWorkspaceSkill[]>;
}

const PREFIXES: ReadonlyArray<[string, LibraryItemKind]> = [
  [SKILL_ROW_PREFIX, "skill"], [AGENT_ROW_PREFIX, "agent"], [COMMAND_ROW_PREFIX, "command"],
];

/** The AI item a row id stands for; a page or database id is null. */
export function libraryItemRef(rowId: string): LibraryItemRef | null {
  const match = PREFIXES.find(([prefix]) => rowId.startsWith(prefix));
  return match && rowId.length > match[0].length ? { kind: match[1], key: rowId.slice(match[0].length) } : null;
}

const defaultClient: LibraryItemClient = {
  listCommands: () => listCommands("chat"), listAgents, getAgent, listWorkspaceSkills,
};

async function agentDetail(key: string, client: LibraryItemClient): Promise<LibraryItemDetail | null> {
  const agent = (await client.listAgents()).find((entry) => entry.id === key);
  if (!agent) return null;
  if (agent.kind !== "custom") return { title: agent.name, label: "Built-in agent", description: agent.description };
  const full = await client.getAgent(key);
  const label = full.scope === "workspace" ? "Workspace agent" : "Your agent";
  const body = full.instructions ? { label: "Instructions", text: full.instructions } : undefined;
  return { title: full.name, label, description: full.description, body };
}

/** The detail of one item, or null when the service no longer has it. */
export async function loadLibraryItemDetail(
  ref: LibraryItemRef, workspaceId: string | undefined, client: LibraryItemClient = defaultClient,
): Promise<LibraryItemDetail | null> {
  if (ref.kind === "command") {
    const command = (await client.listCommands()).find((entry) => entry.name === ref.key);
    return command
      ? { title: `/${command.name}`, label: "Command", description: command.description, body: { label: "Template", text: command.template } }
      : null;
  }
  if (ref.kind === "skill") {
    if (!workspaceId) return null;
    const skill = (await client.listWorkspaceSkills(workspaceId)).find((entry) => entry.id === ref.key);
    return skill
      ? { title: skill.name, label: "Workspace skill", description: skill.description, body: { label: "Body", text: skill.body } }
      : null;
  }
  return agentDetail(ref.key, client);
}
