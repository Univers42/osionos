/**
 * A row of the service's transcript as a message of the chat.
 *
 * The answer keeps the agent the service stored with it, so a reloaded
 * conversation names who wrote each answer.
 */

import type { AiMessage } from "@/features/ai/api/aiClient";
import type { ChatMessage } from "./chatTypes";

/** The text of a server message, from its text parts. */
export function textOfParts(parts: AiMessage["parts"]): string {
  return parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n\n");
}

/** The chat message of a transcript row; the caller drops the `tool` rows first. */
export function chatMessageFromTranscript(row: AiMessage, conversationId: string, id: string): ChatMessage {
  return {
    id,
    conversationId,
    role: row.role === "user" ? "user" : row.role === "system" ? "system" : "assistant",
    content: textOfParts(row.parts),
    createdAt: row.createdAt,
    parts: row.parts,
    runId: row.runId || undefined,
    model: row.model,
    ...(row.role === "assistant" && row.agentId ? { agentId: row.agentId } : {}),
    status: "done",
  };
}
