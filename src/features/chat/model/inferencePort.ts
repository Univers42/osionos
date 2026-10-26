/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inferencePort.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * THE INFERENCE BOUNDARY (§6.5). The Chat Shell's "send" path terminates here.
 * Phase 1 shipped ONLY a stub that returns a visibly-fake assistant message echoing
 * the resolved {connector, model}. Phase 2 = swap in a real adapter behind
 * this single port — e.g. the existing agent streaming / bridge-agent path.
 */

import type { RunContext } from "@/features/ai/model/aiContext";

export interface InferenceMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface InferenceRequest {
  connectorId: string;
  model: string;
  messages: InferenceMessage[];
  /** The connection the answer is paid for — `platform` when the caller does not say. */
  connectionId?: string;
}

export interface InferenceResult {
  content: string;
}

/** The payload of a stream frame. The pane reads `text`, `code` and `message`. */
export interface InferenceEventData {
  text?: string;
  code?: string;
  message?: string;
  runId?: string;
  /** The title the service gave the conversation, on `run.started`. */
  conversationTitle?: string;
  /** How many sources the service read, on `run.started`. */
  retrievedCount?: number;
  /** The source of a `citation` frame. */
  n?: number;
  pageId?: string;
  blockId?: string;
  title?: string;
  snippet?: string;
  [key: string]: unknown;
}

/** What a streamed answer is asked for. */
export interface StreamInferenceRequest {
  /** The local conversation — the key the port maps to its server-side one. */
  conversationId: string;
  /** The user's text for this turn. */
  text: string;
  /** The model the app has selected, if any. */
  model?: string;
  /** The provider the app has selected, if any. */
  connectorId?: string;
  /** The connection the run is paid for — the user's own, or the platform's. */
  connectionId?: string;
  /** The agent that shapes the run — one of the built-ins, or none. */
  agentId?: string;
  /** The server-side conversation, when the local one already has one. */
  serverConversationId?: string;
  /** The title the server-side conversation gets when it is created. */
  title?: string;
  /** The workspace that owns the conversation, when the caller knows it. */
  workspaceId?: string;
  /** What the answer is read from: pages of the workspace, or all of it. */
  context?: RunContext;
  /** The images attached to this run. */
  attachments?: Array<{ kind: "chat"; id: string } | { kind: "media"; path: string; name?: string }>;
  /** Called once the server-side conversation exists (created on the first send). */
  onServerConversationId?: (id: string) => void;
}

export interface InferencePort {
  complete(request: InferenceRequest): Promise<InferenceResult>;
  /**
   * A streamed answer. OPTIONAL: a port without it answers with `complete`
   * only — that is the offline path, and it keeps working.
   *
   * The port owns the run: it must relay every frame to `onEvent`, and a stop
   * (the abort of `signal`) must cancel the run on the service too.
   */
  stream?(
    request: StreamInferenceRequest,
    onEvent: (event: string, data: InferenceEventData) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  /**
   * Attaches to a run that is ALREADY on the service. OPTIONAL, like `stream`.
   *
   * A write the user approved has a follow-up: the service continued the run
   * on its own, and the client picks that run up — the same way it resumes a
   * run whose connection dropped.
   */
  attach?(
    runId: string,
    onEvent: (event: string, data: InferenceEventData) => void,
    signal?: AbortSignal,
  ): Promise<void>;
}

/** Phase-1 stub: a fixed, obviously-fake assistant turn. Crosses no inference fence. */
export const stubInferencePort: InferencePort = {
  async complete({ connectorId, model }) {
    return { content: `[stub] connector=${connectorId} model=${model} — inference not wired in Phase 1` };
  },
};
