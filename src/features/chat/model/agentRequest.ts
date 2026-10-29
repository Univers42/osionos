/**
 * "Try it" from the Hub: the agent a new chat should start with. A store, not
 * view state, because the request is made while the chat tab may be closed and
 * must land when it mounts. Taken once, like the assistant hand-off.
 */

import { create } from "zustand";

interface AgentRequestState {
  agentId: string | null;
  request: (agentId: string) => void;
  take: () => string | null;
}

export const useAgentRequest = create<AgentRequestState>((set, get) => ({
  agentId: null,
  request: (agentId) => set({ agentId }),
  take: () => {
    const agentId = get().agentId;
    if (agentId) set({ agentId: null });
    return agentId;
  },
}));
