/**
 * The panel of agents of a chat: who is on it, and the send that runs it.
 *
 * The panel stays until the reader clears it: every message then goes to the
 * first agent, and the others are asked in turn what they would add or challenge.
 */

import { useCallback, useMemo, useRef, useState } from "react";

import { useChatStore } from "@/features/chat/model/useChatStore";
import type { AgentSummary } from "@/features/ai/model/aiAgents";
import { PANEL_MIN, panelTurns, runPanel, type PanelTurn } from "@/features/chat/model/agentPanel";

type Send = ReturnType<typeof useChatStore.getState>["send"];

export function useAgentPanel(agents: AgentSummary[]) {
  const [ids, setIds] = useState<string[]>([]);
  const running = useRef(false);
  const cancelled = useRef(false);
  // An agent that left the list since it was picked leaves the panel too.
  const members = useMemo(() => ids.flatMap((id) => agents.find((agent) => agent.id === id) ?? []), [ids, agents]);
  const active = members.length >= PANEL_MIN;

  /** Sends the first text to the panel; resolves when the last turn ended or one failed. */
  const sendToPanel = useCallback(async (conversationId: string, text: string, sel: Parameters<Send>[2]) => {
    running.current = true;
    cancelled.current = false;
    // A turn well finished: the conversation grew, and its last message is an answer that did not fail.
    const finishedWell = (before: number) => {
      const all = useChatStore.getState().messagesFor(conversationId);
      const last = all[all.length - 1];
      return all.length > before + 1 && last.role === "assistant" && last.status !== "error";
    };
    try {
      await runPanel(panelTurns(members, text), async (turn: PanelTurn, index) => {
        const before = useChatStore.getState().messagesFor(conversationId).length;
        // Only the first turn carries the attachments and the context of the message.
        await useChatStore.getState().send(conversationId, turn.text, { ...(index === 0 ? sel : { ...sel, attachments: undefined, context: undefined }), agentId: turn.agentId });
        return finishedWell(before);
      }, () => cancelled.current);
    } finally {
      running.current = false;
    }
  }, [members]);

  return {
    panelIds: ids,
    setPanelIds: setIds,
    members,
    active,
    isRunning: () => running.current,
    sendToPanel,
    /** The stop button: the run in flight is stopped by the caller, and the panel stops with it. */
    cancel: () => { cancelled.current = true; },
  };
}
