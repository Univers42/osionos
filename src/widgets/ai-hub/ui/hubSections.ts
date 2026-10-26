import type { HubSectionId } from "@/features/ai/model/aiHubNav";

export type { HubSectionId };

export const HUB_SECTIONS: readonly { id: HubSectionId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "connections", label: "Connections" },
  { id: "usage", label: "Usage" },
  { id: "skills", label: "Skills" },
  { id: "memory", label: "Memory" },
  { id: "mcp", label: "MCP & tokens" },
  { id: "privacy", label: "Context & privacy" },
];
