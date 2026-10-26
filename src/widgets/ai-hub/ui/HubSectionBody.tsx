// Each Hub section renders the component Settings renders: nothing is built twice.
import React from "react";
import { AccessTokensPanel } from "@/features/settings/ai/AccessTokensPanel";
import { AiConnectionsPanel } from "@/features/settings/ai/AiConnectionsPanel";
import { AiMemoryPanel } from "@/features/settings/ai/AiMemoryPanel";
import { AiSwitches } from "@/features/settings/ai/AiSwitches";
import { WorkspaceSkillsPanel } from "@/features/settings/ai/WorkspaceSkillsPanel";
import { useAiWorkspaces } from "@/features/settings/ai/useAiWorkspaces";
import { Section } from "@/features/settings/ui/settingsKit";
import { HubOverview, HubUsageSection } from "./HubOverview";
import type { HubSectionId } from "./hubSections";

export const HubSectionBody: React.FC<{ id: HubSectionId }> = ({ id }) => {
  const workspaces = useAiWorkspaces();
  switch (id) {
    case "overview": return <HubOverview />;
    case "connections": return <AiConnectionsPanel />;
    case "usage": return <HubUsageSection />;
    case "skills": return <WorkspaceSkillsPanel workspaces={workspaces} />;
    case "memory": return <AiMemoryPanel workspaces={workspaces} />;
    // AccessTokensPanel already ends with the MCP approvals section.
    case "mcp": return <AccessTokensPanel workspaces={workspaces} />;
    case "privacy": return <Section title="Context & privacy"><AiSwitches /></Section>;
  }
};
