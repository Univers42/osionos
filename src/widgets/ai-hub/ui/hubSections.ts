export const HUB_SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "connections", label: "Connections" },
  { id: "usage", label: "Usage" },
  { id: "skills", label: "Skills" },
  { id: "memory", label: "Memory" },
  { id: "mcp", label: "MCP & tokens" },
  { id: "privacy", label: "Context & privacy" },
] as const;

export type HubSectionId = (typeof HUB_SECTIONS)[number]["id"];
