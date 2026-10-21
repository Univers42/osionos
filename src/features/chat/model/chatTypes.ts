/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   chatTypes.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/** Chat Shell domain model (§5). Local-first; persisted via useChatStore. */

import type { AiPart } from "@/features/ai/api/aiClient";

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  connectorId?: string;
  model?: string;
  /** The message parts, in the service's shape. */
  parts?: AiPart[];
  /** The run that produced this message, once the service answered. */
  runId?: string;
  /** Where the answer stands: streaming, done, or failed. */
  status?: "streaming" | "done" | "error";
  /** The service's code when the answer failed. */
  errorCode?: string;
}

export interface Conversation {
  id: string;
  /** null = lives outside any project (the default bucket). */
  projectId: string | null;
  title: string;
  /** Selected default connector + model for this conversation. */
  connectorId?: string;
  model?: string;
  /** The conversation on the AI service, once it has one. */
  serverConversationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export type ContextScope = "project" | "conversation";

/** A shared-context item attachable at project and/or conversation scope. */
export interface SharedContextItem {
  id: string;
  scope: ContextScope;
  scopeId: string;
  /** What it points at — rendering/LLM consumption is out of scope (§5). */
  kind: "page" | "file" | "url" | "note";
  label: string;
  ref?: string;
  createdAt: string;
}
