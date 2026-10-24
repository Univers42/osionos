/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiDockModel.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The dock's AI tab: ONE AI path.
 *
 * The tab used to speak to the retired claude-CLI route
 * (/api/agent/claude/stream) — a route no deployed config enables, so the tab
 * was a dead one. It now answers through the SAME inference port as the
 * Assistant pane (features/ai/model/aiInferencePort.ts), and when no AI
 * service is configured the tab is not shown at all: no dead tab, no error.
 *
 * The rules live here, away from the panel, so they can be tested without a
 * browser and without a service.
 */

import { getInferencePort } from "@/features/chat/model/useChatStore";
import type { InferencePort } from "@/features/chat/model/inferencePort";

/** The tab shows only when the app can answer: the AI service is configured. */
export function aiDockTabVisible(configured: boolean): boolean {
  return configured;
}

/** The port the tab answers through: the one injected at app start. */
export function aiDockPort(): InferencePort {
  return getInferencePort();
}

/** One turn of the tab's conversation. */
export interface AiDockTurn {
  /** The port that answers — the injected one, never the agent route. */
  port: InferencePort;
  /** The local conversation: the key the port maps to its server-side one. */
  conversationId: string;
  /** The user's text. */
  text: string;
  /** The connection the run is paid for. */
  connectionId?: string;
  /** The model, when the user picked one. */
  model?: string;
  /** The server-side conversation, when the local one already has one. */
  serverConversationId?: string;
  /** Called once the server-side conversation exists. */
  onServerConversationId?: (id: string) => void;
  /** The answer, as it arrives. */
  onDelta: (text: string) => void;
  /** The turn ended. */
  onDone?: () => void;
  /** The turn failed. */
  onError?: (code: string) => void;
  /** The stop button. */
  signal?: AbortSignal;
}

/** Runs one turn of the tab's conversation and relays what comes back. */
export async function runAiDockTurn(turn: AiDockTurn): Promise<void> {
  const { port } = turn;
  const shared = {
    ...(turn.model ? { model: turn.model } : {}),
    ...(turn.connectionId ? { connectionId: turn.connectionId } : {}),
  };

  // No streaming port: the offline path — one complete answer, no frames.
  if (!port.stream) {
    const result = await port.complete({
      connectorId: "ai",
      model: turn.model ?? "auto",
      messages: [{ role: "user", content: turn.text }],
      ...(turn.connectionId ? { connectionId: turn.connectionId } : {}),
    });
    turn.onDelta(result.content);
    turn.onDone?.();
    return;
  }

  await port.stream(
    {
      conversationId: turn.conversationId,
      text: turn.text,
      ...shared,
      ...(turn.serverConversationId ? { serverConversationId: turn.serverConversationId } : {}),
      ...(turn.onServerConversationId ? { onServerConversationId: turn.onServerConversationId } : {}),
    },
    (event, data) => {
      if (event === "text.delta" && typeof data.text === "string") {
        turn.onDelta(data.text);
        return;
      }
      if (event === "done") {
        turn.onDone?.();
        return;
      }
      if (event === "error") {
        turn.onError?.(typeof data.code === "string" ? data.code : "internal");
      }
    },
    turn.signal,
  );
}
