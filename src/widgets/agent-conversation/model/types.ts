/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */


export type AgentMessageRole = "user" | "assistant";
export type AgentToolStatus = "running" | "complete" | "error";
export type AgentToolKey = "app" | "status" | "workspace" | "list" | "search" | "read" | "create" | "update" | "archive";

export interface AgentToolEvent {
  id: string;
  name: string;
  status: AgentToolStatus;
  detail: string;
}

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  body: string;
  createdAt: string;
  toolEvents?: AgentToolEvent[];
  createdPageId?: string;
  createdPageTitle?: string;
}

export interface AgentRunSettings {
  agent: "default" | "general-purpose" | "Explore" | "Plan";
  model: "default" | "sonnet" | "opus" | "haiku";
  effort: "low" | "medium" | "high" | "xhigh";
  allowedTools: AgentToolKey[];
  mirrorCreatedPages: boolean;
}
