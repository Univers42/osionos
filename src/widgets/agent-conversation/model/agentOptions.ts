/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   agentOptions.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


import type { AgentToolKey } from "./types";

export const CLAUDE_STREAM_ENDPOINT = "/api/agent/claude/stream";
export const DEFAULT_PROMPT = "Ask Claude anything, or ask it to create/update osionos pages through MCP.";

export const TOOL_OPTIONS: Array<{ value: AgentToolKey; label: string }> = [
  { value: "app", label: "App map" },
  { value: "status", label: "Status" },
  { value: "workspace", label: "Workspaces" },
  { value: "list", label: "List pages" },
  { value: "search", label: "Search" },
  { value: "read", label: "Read" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "archive", label: "Archive" },
];
