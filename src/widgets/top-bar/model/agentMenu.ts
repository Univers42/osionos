/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   agentMenu.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { AgentSummary } from "@/features/ai/model/aiAgents";
import { useAgentRequest } from "@/features/chat/model/agentRequest";
import { chatTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import type { MenuAction, MenuContext } from "./menuTypes";

/** Rows shown before the list scrolls. */
export const AGENT_MENU_CAP = 8;

/** Frames to wait for a lazily mounted chat tab before giving up. */
const COMPOSER_FRAMES = 30;

/**
 * Focus the assistant composer's text field once its tab has mounted, polling
 * one frame at a time. Ponytail: gives up silently after 30 frames (~0.5 s), so
 * a chat tab slower than that opens without the caret in it.
 */
function focusComposer(framesLeft: number = COMPOSER_FRAMES): void {
  requestAnimationFrame(() => {
    const field = document.querySelector<HTMLElement>('[data-dictation-composer="assistant"] textarea');
    if (field) field.focus();
    else if (framesLeft > 0) focusComposer(framesLeft - 1);
  });
}

/** Open (or focus) the assistant tab and put the caret in its composer. */
export function openAssistant(): void {
  useWorkspaceLayout.getState().openTab(chatTab());
  focusComposer();
}

/** A built-in agent, or a custom one that is not archived. */
function isRunnable(agent: AgentSummary): boolean {
  return agent.kind !== "custom" || !agent.archived;
}

/** One row per runnable agent: queue the request, then open the assistant. */
function agentRow(agent: AgentSummary): MenuAction {
  return {
    id: `agent.${agent.id}`,
    label: agent.name,
    run: () => {
      useAgentRequest.getState().request(agent.id);
      openAssistant();
    },
  };
}

/**
 * The agent caret's menu: up to eight runnable agents (or a disabled "No agents
 * yet"), then the AI settings and the agents settings.
 */
export function agentMenuItems(agents: readonly AgentSummary[], ctx: MenuContext): MenuAction[] {
  const rows = agents.filter(isRunnable).slice(0, AGENT_MENU_CAP).map(agentRow);
  const head: MenuAction[] = rows.length > 0
    ? rows
    : [{ id: "agent.none", label: "No agents yet", run: () => undefined, disabled: () => true }];
  head[head.length - 1] = { ...head[head.length - 1], separatorAfter: true };
  return [
    ...head,
    { id: "agent.hub", label: "AI settings", run: () => ctx.openSettings("ai") },
    { id: "agent.manage", label: "Manage agents…", run: () => ctx.openSettings("ai_agents") },
  ];
}
