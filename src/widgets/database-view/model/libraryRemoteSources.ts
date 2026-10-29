/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   libraryRemoteSources.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/29 12:00:00 by dlesieur          #+#    #+#             */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Library rows that live on the AI service: workspace skills, agents and
 * slash commands. Agents are asked for only when the workspace has agents on
 * (a 404 on its agent settings means the deployment has them off), and they
 * are kept per user AND workspace: a user-scope agent is its owner's alone, so
 * the next user on this tab asks again. Skills are member-readable and kept per
 * workspace; commands are the same built-ins for everyone.
 *
 * Caveat: each list is fetched once per tab — an agent or skill made after the
 * first load shows after a page reload, not live.
 */

import type { AiAgent } from "@/features/ai/api/aiContract";
import { getAgentSettings, listAgents, listCommands, listWorkspaceSkills } from "@/features/ai/api/aiClient";
import { isAgentsOff } from "@/features/ai/model/agentForm";
import type { LibraryAgent, LibraryCommand, LibrarySkill } from "./libraryDatabaseModel";

export interface LibraryRemote {
  skills: readonly LibrarySkill[];
  /** Null while the workspace's agents are off or not known yet: no rows, no tab. */
  agents: readonly LibraryAgent[] | null;
  commands: readonly LibraryCommand[];
}

const skillsByWorkspace = new Map<string, readonly LibrarySkill[]>();
const agentsByUserWorkspace = new Map<string, readonly LibraryAgent[]>();
let commands: readonly LibraryCommand[] = [];
const requested = new Set<string>();

function once(key: string, load: () => Promise<void>, onLoaded: () => void): void {
  if (requested.has(key)) return;
  requested.add(key);
  load().then(onLoaded, (error: unknown) => console.warn(`[library] ${key.split(":")[0]} unavailable`, error));
}

/** The agents this workspace's Library lists: built-ins, the viewer's own, the workspace's. */
function libraryAgent(workspaceId: string) {
  return (agent: AiAgent): LibraryAgent[] => {
    if (agent.kind !== "custom") return [{ id: agent.id, name: agent.name, scope: "builtin" }];
    if (agent.archived || (agent.scope === "workspace" && agent.workspaceId !== workspaceId)) return [];
    return [{ id: agent.id, name: agent.name, scope: agent.scope }];
  };
}

async function loadAgents(key: string, workspaceId: string): Promise<void> {
  const settings = await getAgentSettings(workspaceId).catch((error: unknown) => {
    if (isAgentsOff(error)) return null;
    throw error;
  });
  if (!settings?.agents_enabled) return;
  agentsByUserWorkspace.set(key, (await listAgents()).flatMap(libraryAgent(workspaceId)));
}

/** What is known now; the first call for a user and workspace starts the fetches,
 *  and `onLoaded` runs once each one lands. */
export function libraryRemote(userId: string, workspaceId: string, onLoaded: () => void): LibraryRemote {
  const agentsKey = `${userId}:${workspaceId}`;
  once(`skills:${workspaceId}`, async () => {
    const skills = await listWorkspaceSkills(workspaceId);
    skillsByWorkspace.set(workspaceId, skills.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })));
  }, onLoaded);
  once(`agents:${agentsKey}`, () => loadAgents(agentsKey, workspaceId), onLoaded);
  once("commands", async () => {
    commands = (await listCommands("chat")).map(({ name }) => ({ name }));
  }, onLoaded);
  return {
    skills: skillsByWorkspace.get(workspaceId) ?? [],
    agents: agentsByUserWorkspace.get(agentsKey) ?? null,
    commands,
  };
}
