/**
 * What the next message of the assistant is sent with: who answers, the pages it
 * reads and the model. A store, not view state, because the chat tab and the
 * sidebar's Assistant panel both show and change it. It belongs to one account:
 * claimed by another, the agent and the pages are dropped (the model choice is
 * the browser's, like the stored selection it starts from).
 */

import { create } from "zustand";

import type { ContextChip } from "@/features/ai/model/aiContext";
import { PLATFORM_CONNECTION_ID, readAiSelection, type AiSelection } from "@/features/ai/model/aiSelection";

interface AssistantDraftState {
  ownerId: string | null;
  agentId: string | null;
  chips: ContextChip[];
  selection: AiSelection;
  setAgentId: (agentId: string | null) => void;
  setChips: (chips: ContextChip[]) => void;
  setSelection: (selection: AiSelection) => void;
  /** Makes `userId` the owner; a different owner starts from no agent and no pages. */
  claim: (userId: string | null) => void;
}

export const useAssistantDraft = create<AssistantDraftState>((set, get) => ({
  ownerId: null,
  agentId: null,
  chips: [],
  selection: readAiSelection() ?? { connectionId: PLATFORM_CONNECTION_ID, model: "" },
  setAgentId: (agentId) => set({ agentId }),
  setChips: (chips) => set({ chips }),
  setSelection: (selection) => set({ selection }),
  claim: (userId) => {
    if (get().ownerId === userId) return;
    set({ ownerId: userId, agentId: null, chips: [] });
  },
}));
