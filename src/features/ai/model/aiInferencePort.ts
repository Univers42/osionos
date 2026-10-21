/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiInferencePort.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The AI inference port — the real one, behind the chat feature's boundary.
 *
 * The Assistant pane asks an `InferencePort` for an answer. Offline, that is
 * the stub; with a service configured, it is this adapter: it creates the
 * server-side conversation the first time a local conversation speaks, opens
 * the run, and relays the run's frames to the pane.
 *
 * The providers stay on the service: nothing here talks to one.
 */

import { pumpSseStream } from "@osionos/http-gate";

import {
  AiError,
  cancelRun,
  complete as completeRoute,
  createConversation,
  isAiConfigured,
  resumeRun,
  startRun,
} from "../api/aiClient";
import { streamRun } from "./runStream";
import { getActiveWorkspaceId } from "@/shared/api/client";
import {
  stubInferencePort,
  type InferencePort,
  type InferenceRequest,
  type InferenceResult,
  type StreamInferenceRequest,
} from "@/features/chat/model/inferencePort";

/**
 * The model the service is asked for.
 *
 * "auto" means "the service's default", which the service picks when the
 * client does not choose. Every other name comes from the service's own list
 * (the picker reads it there), so it is sent as it is.
 */
function serviceModel(model?: string): string | undefined {
  const value = model?.trim();
  if (!value || value === "auto") return undefined;
  return value;
}

/** The text of the last user turn — what a completion is asked about. */
function lastUserText(messages: InferenceRequest["messages"]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") return message.content;
  }
  return "";
}

/**
 * The server-side conversation of a local one. It is created on the first
 * send and remembered by the store through `onServerConversationId`.
 */
async function ensureServerConversation(request: StreamInferenceRequest): Promise<string> {
  if (request.serverConversationId) return request.serverConversationId;
  const workspaceId = request.workspaceId ?? getActiveWorkspaceId();
  if (!workspaceId) throw new AiError(400, "invalid_request", "No workspace is selected.");
  const conversation = await createConversation({ workspaceId, title: request.title });
  request.onServerConversationId?.(conversation.id);
  return conversation.id;
}

/** The port the Assistant pane talks to when the AI service is configured. */
export const aiInferencePort: InferencePort = {
  /** A one-shot completion — the service's `/complete` route, never persisted. */
  async complete(request: InferenceRequest): Promise<InferenceResult> {
    const response = await completeRoute({
      runId: crypto.randomUUID(),
      command: "ask",
      input: { text: lastUserText(request.messages) },
      model: serviceModel(request.model),
      connectionId: request.connectionId,
    });
    let content = "";
    await pumpSseStream(response, (event, data) => {
      if (event === "text.delta" && typeof data.text === "string") content += data.text;
    });
    return { content };
  },

  /** A streamed run: the pane gets every frame as the service produces it. */
  async stream(request, onEvent, signal): Promise<void> {
    const conversationId = await ensureServerConversation(request);
    const runId = crypto.randomUUID();

    // A stop is an abort: the run is cancelled on the service too, so it stops
    // burning tokens there.
    const onAbort = () => {
      void cancelRun(runId).catch(() => undefined);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      await streamRun({
        start: () =>
          startRun(
            {
              runId,
              conversationId,
              text: request.text,
              model: serviceModel(request.model),
              connectionId: request.connectionId,
              // What the answer is read from — the pages the reader pointed at.
              context: request.context,
              attachments: request.attachments,
            },
            signal,
          ),
        resume: (lastEventId) => resumeRun(runId, lastEventId, signal),
        onEvent,
        signal,
      });
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  },
};

/**
 * The port the app starts with: the AI service when a base URL is configured,
 * the offline stub otherwise.
 */
export function selectInferencePort(): InferencePort {
  return isAiConfigured() ? aiInferencePort : stubInferencePort;
}
