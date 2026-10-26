/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiWire.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The conversation routes of osionos-ai answer with their database rows
// (services/osionos-ai/src/conversations/repo.ts): snake_case columns. Read as
// AiConversation, `updatedAt` was undefined and the Conversations panel threw
// on its sort, blanking the whole app on every load (live, 2026-10-26).

import type { AiConversation, AiMessage, AiPart } from "./aiContract";

/** A row of `public.ai_conversations`, as JSON. */
export interface ConversationWire {
  id: string;
  workspace_id: string;
  title: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
}

/** A row of `public.ai_messages`, as JSON. */
export interface MessageWire {
  id: string;
  conversation_id: string;
  run_id: string | null;
  role: AiMessage["role"];
  parts: AiPart[] | null;
  model: string | null;
  created_at: string;
}

export function conversationFromWire(row: ConversationWire): AiConversation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title ?? "",
    ...(row.model ? { model: row.model } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function messageFromWire(row: MessageWire): AiMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    runId: row.run_id ?? "",
    role: row.role,
    parts: row.parts ?? [],
    ...(row.model ? { model: row.model } : {}),
    createdAt: row.created_at,
  };
}

/** The summary the assistant keeps of the turns that left its window. */
export interface ConversationSummary {
  text: string;
  /** The timestamp of the last message the summary covers. */
  through: string;
}

/** The `summary` key of a transcript body: a summary, null, or undefined (absent or malformed). */
export function summaryFromBody(body: unknown): ConversationSummary | null | undefined {
  if (typeof body !== "object" || body === null || !("summary" in body)) return undefined;
  const raw = (body as { summary: unknown }).summary;
  if (raw === null) return null;
  if (typeof raw !== "object") return undefined;
  const { text, through } = raw as { text?: unknown; through?: unknown };
  return typeof text === "string" && typeof through === "string" ? { text, through } : undefined;
}
