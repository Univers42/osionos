// Settings › AI agents, AI skills and AI memory: the AI panels that act on a workspace.
// Each panel renders nothing without a service or a workspace, so one guard says why, under
// the section's anchor, which therefore exists on first paint for the view to scroll to.
import React from "react";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { AgentsSection } from "./AgentsSection";
import { AiMemoryPanel } from "./AiMemoryPanel";
import type { AccessTokenWorkspace } from "./AccessTokensPanel";
import { AI_NOT_CONFIGURED } from "./AiStatusCards";
import { MCP_TEXT_MUTED_SM } from "./aiPanelClasses";
import { WorkspaceSkillsPanel } from "./WorkspaceSkillsPanel";
import { useAiWorkspaces } from "./useAiWorkspaces";

const NO_WORKSPACE = "Join or create a workspace to manage its skills, memory and agents";

const AiWorkspaceGate: React.FC<{ anchor: string; children: (workspaces: AccessTokenWorkspace[]) => React.ReactNode }> = ({ anchor, children }) => {
  const workspaces = useAiWorkspaces();
  let reason: string | null = null;
  if (!isAiConfigured()) reason = AI_NOT_CONFIGURED;
  else if (workspaces.length === 0) reason = NO_WORKSPACE;
  return (
    <div data-settings-anchor={anchor}>
      {reason ? <p className={MCP_TEXT_MUTED_SM}>{reason}</p> : children(workspaces)}
    </div>
  );
};

export const AiAgentsSettings: React.FC = () => (
  <AiWorkspaceGate anchor="ai-agents">{(workspaces) => <AgentsSection workspaces={workspaces} />}</AiWorkspaceGate>
);

export const AiSkillsSettings: React.FC = () => (
  <AiWorkspaceGate anchor="ai-skills">{(workspaces) => <WorkspaceSkillsPanel workspaces={workspaces} />}</AiWorkspaceGate>
);

export const AiMemorySettings: React.FC = () => (
  <AiWorkspaceGate anchor="ai-memory">{(workspaces) => <AiMemoryPanel workspaces={workspaces} />}</AiWorkspaceGate>
);
