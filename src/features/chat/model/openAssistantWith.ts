/**
 * "Ask AI" from anywhere (C419): hands a quote, and the page it is about, to
 * the Assistant and opens it. Nothing is sent — the user reads, edits and
 * presses Send. A new hand-off replaces a pending one (C425).
 */

import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { chatTab } from "@/widgets/workspace-grid/model/layoutPersist";
import { useAssistantHandoff, type AssistantHandoff } from "./assistantHandoff";
import { useChatStore } from "./useChatStore";

export function openAssistantWith(handoff: Omit<AssistantHandoff, "attachments">): void {
  useAssistantHandoff.getState().handOff({ attachments: [], ...handoff });
  useWorkspaceLayout.getState().openTab(chatTab());
}

/** Shows conversation `id` in the Assistant tab, opening the tab if needed. */
export function openAiChat(id: string): void {
  useChatStore.getState().setActive(id);
  useWorkspaceLayout.getState().openTab(chatTab());
}

/** Starts a new conversation in the Assistant tab. */
export function startAiChat(): void {
  openAiChat(useChatStore.getState().createConversation().id);
}
