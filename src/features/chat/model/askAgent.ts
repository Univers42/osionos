/**
 * Asks a question again, of an agent: a new run appended to the conversation,
 * the earlier answer kept. The model and the connection are the reader's saved choice.
 */

import { readAiSelection } from "@/features/ai/model/aiSelection";
import { useChatStore } from "./useChatStore";

export function askAgent(conversationId: string, question: string, agentId: string): Promise<void> {
  const selection = readAiSelection();
  return useChatStore.getState().send(conversationId, question, {
    agentId,
    ...(selection ? { connectionId: selection.connectionId, model: selection.model || "auto" } : {}),
  });
}
