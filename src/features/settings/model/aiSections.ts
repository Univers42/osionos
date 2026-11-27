// The AI sections of the settings registry (sections.ts spreads them in, in this order):
// the assistant's status and switches, then what it may do in a workspace, then the
// model access and MCP servers the user brings.

import { BookOpen, BotMessageSquare, Brain, Plug, Sparkles } from "lucide-react";

import type { SettingsSection } from "./sectionTypes";

export const AI_SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    id: "ai", group: "features", label: "osionos AI", title: "osionos AI",
    subtitle: "Search everywhere, automate meeting notes and configure AI features", icon: Sparkles,
    anchors: [
      { id: "ai-overview", label: "AI overview", keywords: ["ai", "status", "health", "service", "model"] },
      { id: "ai-usage", label: "AI usage", keywords: ["usage", "spend", "spent", "cost", "limit", "budget"] },
      { id: "osionos-ai", label: "osionos AI", keywords: ["ai", "meeting notes", "summaries", "search", "switches"] },
      { id: "ai-routing", label: "Model routing", keywords: ["routing", "fallback", "failover", "model", "busy"] },
      // Not "Privacy": Preferences › Privacy owns that label (cookies, discoverability).
      { id: "ai-privacy", label: "What your next message sends", keywords: ["ai", "privacy", "context", "sent", "outgoing", "data"] },
    ],
  },
  {
    id: "ai_agents", group: "features", label: "AI agents", title: "AI agents",
    subtitle: "The agents of your workspace, and what each may do", icon: BotMessageSquare,
    anchors: [{ id: "ai-agents", label: "AI agents", keywords: ["agents", "agent", "assistant", "automation"] }],
  },
  {
    id: "ai_skills", group: "features", label: "AI skills", title: "AI skills",
    subtitle: "Instructions the assistant can load for your workspace", icon: BookOpen,
    anchors: [{ id: "ai-skills", label: "Workspace skills", keywords: ["skills", "skill", "instructions", "prompts"] }],
  },
  {
    id: "ai_memory", group: "features", label: "AI memory", title: "AI memory",
    subtitle: "What the assistant remembers about your workspace", icon: Brain,
    anchors: [{ id: "ai-memory", label: "AI memory", keywords: ["memory", "remember", "memories", "forget"] }],
  },
  {
    id: "ai_connections", group: "features", label: "AI connections", title: "AI connections",
    subtitle: "Bring your own model access and MCP servers — your keys stay on the server", icon: Plug,
    anchors: [
      { id: "ai-connections", label: "AI connections", keywords: ["openrouter", "model", "provider", "api key", "byok", "connect"] },
      { id: "mcp-servers", label: "Your MCP servers", keywords: ["mcp", "server", "servers", "tools"] },
      { id: "ai-access-tokens", label: "AI access tokens", keywords: ["token", "access token", "pat", "api", "assistant"] },
    ],
  },
];
