/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   top-bar-agent-menu.test.ts                         :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";
import type { AgentSummary } from "../../src/features/ai/model/aiAgents.ts";
import { useAgentRequest } from "../../src/features/chat/model/agentRequest.ts";
import { agentMenuItems } from "../../src/widgets/top-bar/model/agentMenu.ts";
import { useWorkspaceLayout } from "../../src/widgets/workspace-grid/model/workspaceLayout.ts";
import { chatTab } from "../../src/widgets/workspace-grid/model/layoutPersist.ts";
import { activeTabOf } from "../../src/widgets/workspace-grid/model/layoutTree.ts";

Object.assign(globalThis, { requestAnimationFrame: () => 0 });

const builtin = (id: string): AgentSummary => ({ id, version: 1, name: id, description: "" });
const custom = (id: string, archived: boolean): AgentSummary => ({
  kind: "custom", id, scope: "user", workspaceId: null, name: id, description: "", tools: [], skills: [], version: 1, archived, needsReview: false,
});
const settingsCalls: unknown[] = [];
const ctx = { openSettings: (section?: unknown) => { settingsCalls.push(section); } };
const activeId = (): string | undefined => {
  const state = useWorkspaceLayout.getState();
  return activeTabOf(state.root, state.activePaneId)?.pageId;
};

test("no agents: a disabled placeholder, then the hub and the manage rows", () => {
  const rows = agentMenuItems([], ctx);
  assert.deepEqual(rows.map((row) => row.label), ["No agents yet", "AI hub", "Manage agents…"]);
  assert.equal(rows[0].disabled?.(), true);
  assert.equal(rows[0].separatorAfter, true);
});

test("archived custom agents are left out, built-ins and live custom agents stay", () => {
  const rows = agentMenuItems([builtin("analyst"), custom("c1", false), custom("c2", true)], ctx);
  assert.deepEqual(rows.slice(0, -2).map((row) => row.label), ["analyst", "c1"]);
});

test("the list is capped at 8 agents", () => {
  const rows = agentMenuItems(Array.from({ length: 12 }, (_, index) => builtin(`a${index}`)), ctx);
  assert.equal(rows.length, 8 + 2);
});

test("an agent row queues the request and opens the assistant", () => {
  agentMenuItems([builtin("analyst")], ctx)[0].run();
  assert.equal(useAgentRequest.getState().agentId, "analyst");
  assert.equal(activeId(), chatTab().pageId);
});

test("Manage agents opens the AI settings section", () => {
  agentMenuItems([], ctx).at(-1)?.run();
  assert.deepEqual(settingsCalls, ["ai"]);
});
