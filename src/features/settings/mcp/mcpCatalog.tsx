/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mcpCatalog.tsx                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Figma, Github } from "lucide-react";

export type McpAppCategory = "AI assistants" | "Developer tools" | "Design" | "Automation & CRM";

export interface McpApp {
  id: string;
  name: string;
  description: string;
  category: McpAppCategory;
  color: string; // brand accent for the icon tile (offline-safe stand-in for a logo)
  mark: string; // 1–2 char monogram shown when there is no vector logo
}

// The connectable external AI apps. Order defines Discover display order; the
// grid groups by `category`. A few beyond the named set ("other AI tools").
export const MCP_APP_CATALOG: McpApp[] = [
  { id: "chatgpt", name: "ChatGPT", description: "OpenAI's assistant — chat, search, and act on your pages.", category: "AI assistants", color: "#10A37F", mark: "G" },
  { id: "claude", name: "Claude", description: "Anthropic's assistant with osionos as a connected tool.", category: "AI assistants", color: "#CC785C", mark: "C" },
  { id: "mistral", name: "Mistral", description: "Le Chat and Mistral models over MCP.", category: "AI assistants", color: "#FA520F", mark: "M" },
  { id: "perplexity", name: "Perplexity", description: "Answer engine that can read your workspace.", category: "AI assistants", color: "#20808D", mark: "P" },
  { id: "poke", name: "Poke", description: "Interaction's proactive assistant.", category: "AI assistants", color: "#EC4899", mark: "Pk" },
  { id: "cursor", name: "Cursor", description: "The AI code editor — pull osionos docs into context.", category: "Developer tools", color: "#0B0B0F", mark: "Cu" },
  { id: "devin", name: "Devin", description: "Cognition's autonomous software engineer.", category: "Developer tools", color: "#0EA5E9", mark: "D" },
  { id: "vscode", name: "VS Code", description: "Copilot and MCP clients inside VS Code.", category: "Developer tools", color: "#2563EB", mark: "VS" },
  { id: "windsurf", name: "Windsurf", description: "Codeium's agentic IDE.", category: "Developer tools", color: "#09B6A2", mark: "W" },
  { id: "github", name: "GitHub", description: "Link issues and PRs to osionos pages.", category: "Developer tools", color: "#24292E", mark: "GH" },
  { id: "raycast", name: "Raycast", description: "Launcher with AI commands over MCP.", category: "Developer tools", color: "#FF6363", mark: "R" },
  { id: "figma", name: "Figma", description: "Bring designs and comments into your docs.", category: "Design", color: "#F24E1E", mark: "Fg" },
  { id: "composio", name: "Composio", description: "Tool-calling integrations hub for agents.", category: "Automation & CRM", color: "#6D28D9", mark: "Co" },
  { id: "zapier", name: "Zapier", description: "Automate osionos across 6,000+ apps.", category: "Automation & CRM", color: "#FF4A00", mark: "Z" },
  { id: "make", name: "Make", description: "Visual automation flows into osionos.", category: "Automation & CRM", color: "#6D00CC", mark: "Mk" },
  { id: "hubspot", name: "HubSpot", description: "Sync CRM records with your workspace.", category: "Automation & CRM", color: "#FF7A59", mark: "H" },
];

export const MCP_APP_CATEGORIES: McpAppCategory[] = ["AI assistants", "Developer tools", "Design", "Automation & CRM"];

export function findMcpApp(appId: string): McpApp | undefined {
  return MCP_APP_CATALOG.find((app) => app.id === appId);
}

/** Brand tile for an app: a real vector mark where we have one, else a monogram. */
export const AppIcon: React.FC<{ app: McpApp; size?: number }> = ({ app, size = 32 }) => {
  const style: React.CSSProperties = { width: size, height: size, background: app.color, color: "#fff" };
  const glyph = size * 0.5;
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-lg font-semibold"
      style={style}
    >
      {app.id === "github" ? (
        <Github size={glyph} />
      ) : app.id === "figma" ? (
        <Figma size={glyph} />
      ) : (
        <span style={{ fontSize: size * 0.34, lineHeight: 1 }}>{app.mark}</span>
      )}
    </span>
  );
};
