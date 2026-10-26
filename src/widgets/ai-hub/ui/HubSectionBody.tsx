// Each Hub section renders the component Settings renders: nothing is built twice.
import React from "react";
import { AccessTokensPanel } from "@/features/settings/ai/AccessTokensPanel";
import { AiConnectionsPanel } from "@/features/settings/ai/AiConnectionsPanel";
import { AiMemoryPanel } from "@/features/settings/ai/AiMemoryPanel";
import { WorkspaceSkillsPanel } from "@/features/settings/ai/WorkspaceSkillsPanel";
import { useAiWorkspaces } from "@/features/settings/ai/useAiWorkspaces";
import { isAiConfigured } from "@/features/ai/api/aiClient";
import { HubPrivacySection } from "./HubPrivacySection";
import { HubRoutingSection } from "./HubRoutingSection";
import { HubOverview, HubUsageSection } from "./HubOverview";
import type { HubSectionId } from "./hubSections";

// The Settings panels render nothing without a service or a workspace; the Hub says why.
const Unavailable: React.FC<{ reason: string }> = ({ reason }) => (
  <p className="text-sm text-[var(--osio-fg-muted)]">{reason}</p>
);

export const HubSectionBody: React.FC<{ id: HubSectionId }> = ({ id }) => {
  const workspaces = useAiWorkspaces();
  if (id === "skills" || id === "memory") {
    if (!isAiConfigured()) return <Unavailable reason="The AI service is not configured on this build" />;
    if (workspaces.length === 0) return <Unavailable reason="Join or create a workspace to manage its skills and memory" />;
  }
  switch (id) {
    case "overview": return <HubOverview />;
    case "connections": return <AiConnectionsPanel />;
    case "routing": return <HubRoutingSection />;
    case "usage": return <HubUsageSection />;
    case "skills": return <WorkspaceSkillsPanel workspaces={workspaces} />;
    case "memory": return <AiMemoryPanel workspaces={workspaces} />;
    // AccessTokensPanel already ends with the MCP approvals section.
    case "mcp": return <AccessTokensPanel workspaces={workspaces} />;
    case "privacy": return <HubPrivacySection />;
  }
};
