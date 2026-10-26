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
import { effortFor, PLATFORM_CONNECTION_ID, readAiFallbacks, readAiSelection, type AiFallbackChoice } from "./aiSelection";
import { streamRun } from "./runStream";
import { DEVICE_CONNECTION_ID, readDeviceEngine } from "./deviceEngine";
import { deviceInferencePort } from "./deviceInferencePort";
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

/**
 * The chain a run is sent with. A device run never has one: its text must not
 * leave the device, and the service cannot route to it.
 */
function runFallbacks(request: StreamInferenceRequest): AiFallbackChoice[] {
  const connectionId = request.connectionId ?? PLATFORM_CONNECTION_ID;
  if (connectionId === DEVICE_CONNECTION_ID) return [];
  return readAiFallbacks(undefined, { connectionId, model: serviceModel(request.model) ?? "" });
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
    const effort = effortFor(readAiSelection(), request.connectionId ?? PLATFORM_CONNECTION_ID, request.model);
    const fallbacks = runFallbacks(request);

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
              // The agent of this run: the one the reader picked, or none.
              ...(request.agentId ? { agentId: request.agentId } : {}),
              // The service applies it only to a model that reasons.
              ...(effort ? { effort } : {}),
              // Absent when empty: a run without a chain is byte-identical to before (C262).
              ...(fallbacks.length > 0 ? { fallbacks } : {}),
              // What the answer is read from — the pages the reader pointed at.
              context: request.context,
              attachments: request.attachments,
              ...(request.replaceFromRunId ? { replaceFromRunId: request.replaceFromRunId } : {}),
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

  /** Attaches to a run that is already on the service: the follow-up of a write. */
  async attach(runId, onEvent, signal) {
    await streamRun({
      // The run went on without the client: it picks up the frames it has not
      // seen — the same stream it resumes after a drop.
      start: () => resumeRun(runId, undefined, signal),
      resume: (lastEventId) => resumeRun(runId, lastEventId, signal),
      onEvent,
      signal,
    });
  },
};

/** The one-shot request of a port without a stream. */
function completeRequest(request: StreamInferenceRequest): InferenceRequest {
  return {
    connectorId: request.connectorId ?? "ai",
    model: request.model ?? "auto",
    messages: [{ role: "user", content: request.text }],
    ...(request.connectionId ? { connectionId: request.connectionId } : {}),
  };
}

/**
 * Routes each call to the port that owns it: the device engine for a `device`
 * connection with an engine stored, the service for everything else.
 *
 * A port without a stream answers in one piece, exactly as the pane's own
 * callers fall back when they meet one.
 */
export function routedInferencePort(
  service: InferencePort,
  device: InferencePort,
  hasDeviceEngine: () => boolean,
): InferencePort {
  const chosen = (request: { connectionId?: string }) =>
    request.connectionId === DEVICE_CONNECTION_ID && hasDeviceEngine() ? device : service;

  return {
    complete: async (request) => chosen(request).complete(request),
    stream: async (request, onEvent, signal) => {
      const port = chosen(request);
      if (port.stream) return port.stream(request, onEvent, signal);
      const result = await port.complete(completeRequest(request));
      if (result.content) onEvent("text.delta", { text: result.content });
      onEvent("done", {});
    },
    attach: async (runId, onEvent, signal) => {
      if (!service.attach) throw new Error("This service cannot attach to a run.");
      return service.attach(runId, onEvent, signal);
    },
  };
}

/**
 * The port the app starts with: the AI service when a base URL is configured,
 * the offline stub otherwise.
 */
export function selectInferencePort(): InferencePort {
  return isAiConfigured()
    ? routedInferencePort(aiInferencePort, deviceInferencePort, () => readDeviceEngine() !== null)
    : stubInferencePort;
}
