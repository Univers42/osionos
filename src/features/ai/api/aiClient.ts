/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiClient.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of `osionos-ai` — the service that owns the providers.
 *
 * The wire contract (scratchpad/design/ai-wire-contract.md) is the law: one
 * function per route, the base URL is `${VITE_AI_URL ?? VITE_OSIONOS_BRIDGE_URL
 * ?? VITE_API_URL}/api/ai`, and every route but `/health` carries the session
 * bearer — the same one the agent stream already sends.
 *
 * Nothing here knows about providers: the browser never talks to one.
 */

import { bearerFetch } from "@/shared/agent/bearerFetch";
import { getActivePageJwt } from "@/shared/api/client";

/** The minimal fetch shape, so a test can inject a stub without a network. */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/* -------------------------------------------------------------------------- */
/* The wire shapes                                                            */
/* -------------------------------------------------------------------------- */

/** A command the service offers (`ask`, `summarize`, …). */
export interface AiCommand {
  name: string;
  description: string;
  template: string;
  surface: "editor" | "chat" | "both";
  model?: string;
}

/** A model on the service's allowlist. */
export interface AiModel {
  id: string;
  label: string;
  default: boolean;
}

/** A conversation, as the service stores it. */
export interface AiConversation {
  id: string;
  workspaceId: string;
  title: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
}

/** One part of a message, in the service's shape. */
export type AiPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; output: unknown }
  | { type: "citation"; pageId: string; blockId?: string; title: string; snippet: string };

/** A message, as the service stores it. */
export interface AiMessage {
  id: string;
  conversationId: string;
  runId: string;
  role: "user" | "assistant" | "system" | "tool";
  parts: AiPart[];
  model?: string;
  createdAt: string;
}

/** The body of `POST /runs`. `runId` is the client's idempotency key. */
export interface StartRunInput {
  runId: string;
  conversationId: string;
  text: string;
  model?: string;
  context?: { pageIds: string[] };
}

/** The body of `POST /complete` — an inline editor action, never persisted. */
export interface CompleteInput {
  runId: string;
  command: string;
  input: { text: string };
  model?: string;
}

/* -------------------------------------------------------------------------- */
/* The errors                                                                 */
/* -------------------------------------------------------------------------- */

/** A refusal from the service: the status and the contract's code. */
export class AiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message || code);
    this.name = "AiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Reads the refusal out of an error response. The contract's envelope is
 * `{ "error": { "code" } }`; a flat `{ "code" }` is read too, so a service that
 * answers the older shape still reaches the user with a code.
 */
async function toAiError(response: Response): Promise<AiError> {
  let code = "unknown";
  let message = "";
  try {
    const body = (await response.clone().json()) as
      | { error?: { code?: string; message?: string }; code?: string; message?: string }
      | null;
    code = body?.error?.code ?? body?.code ?? code;
    message = body?.error?.message ?? body?.message ?? "";
  } catch {
    // A refusal that is not JSON still has a status.
  }
  return new AiError(response.status, code, message);
}

/* -------------------------------------------------------------------------- */
/* The transport                                                              */
/* -------------------------------------------------------------------------- */

/** The base URL of the service, without a trailing slash. */
function serviceBase(): string {
  const env = (import.meta.env ?? {}) as Record<string, string>;
  const base = (env["VITE_AI_URL"] ?? env["VITE_OSIONOS_BRIDGE_URL"] ?? env["VITE_API_URL"] ?? "").trim();
  return base.replace(/\/$/, "");
}

/** The full base URL of the service's API: `${base}/api/ai`. */
export function aiBaseUrl(): string {
  return `${serviceBase()}/api/ai`;
}

/** True when a base URL is configured — the app speaks to the AI service only then. */
export function isAiConfigured(): boolean {
  return serviceBase().length > 0;
}

/** The transport every route uses: the session bearer, like the agent stream. */
let transport: FetchLike = bearerFetch((input, init) => fetch(input, init), getActivePageJwt);

/** Swaps the transport. The tests use it; the app never calls it. */
export function setAiTransport(impl: FetchLike): void {
  transport = impl;
}

async function requestJson<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const response = await transport(`${aiBaseUrl()}${path}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw await toAiError(response);
  return (await response.json()) as T;
}

/** A route that answers with an event stream: the response is handed over as is. */
async function requestStream(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  extra?: { headers?: Record<string, string>; signal?: AbortSignal },
): Promise<Response> {
  const response = await transport(`${aiBaseUrl()}${path}`, {
    method,
    headers: {
      Accept: "text/event-stream",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(extra?.headers ?? {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(extra?.signal ? { signal: extra.signal } : {}),
  });
  if (!response.ok) throw await toAiError(response);
  if (!response.body) throw new AiError(502, "no_stream", "The AI service answered without a stream.");
  return response;
}

/* -------------------------------------------------------------------------- */
/* The routes                                                                 */
/* -------------------------------------------------------------------------- */

/** `GET /commands?surface=` — the commands of one surface. */
export async function listCommands(surface: "editor" | "chat" = "chat"): Promise<AiCommand[]> {
  const body = await requestJson<{ commands?: AiCommand[] }>("GET", `/commands?surface=${encodeURIComponent(surface)}`);
  return body.commands ?? [];
}

/** `GET /models` — the platform's allowlist. */
export async function listModels(): Promise<AiModel[]> {
  const body = await requestJson<{ models?: AiModel[] }>("GET", "/models");
  return body.models ?? [];
}

/** `POST /conversations` — a conversation of the workspace. */
export async function createConversation(input: { workspaceId: string; title?: string }): Promise<AiConversation> {
  return requestJson<AiConversation>("POST", "/conversations", input);
}

/** `GET /conversations?workspaceId=` — the caller's conversations, newest first. */
export async function listConversations(workspaceId: string): Promise<AiConversation[]> {
  const body = await requestJson<{ conversations?: AiConversation[] }>(
    "GET",
    `/conversations?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return body.conversations ?? [];
}

/** `GET /conversations/:id/messages` — the transcript, oldest first. */
export async function listMessages(conversationId: string): Promise<AiMessage[]> {
  const body = await requestJson<{ messages?: AiMessage[] }>(
    "GET",
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  return body.messages ?? [];
}

/** `POST /runs` — the run's event stream. */
export async function startRun(input: StartRunInput, signal?: AbortSignal): Promise<Response> {
  return requestStream("POST", "/runs", input, { signal });
}

/**
 * `GET /runs/:runId/events` — the same stream, resumed after `lastEventId`.
 * The service answers 410 `run_expired` once the stream is gone.
 */
export async function resumeRun(runId: string, lastEventId?: string, signal?: AbortSignal): Promise<Response> {
  return requestStream("GET", `/runs/${encodeURIComponent(runId)}/events`, undefined, {
    headers: lastEventId ? { "Last-Event-ID": lastEventId } : undefined,
    signal,
  });
}

/** `POST /runs/:runId/cancel` — stops a run that is still going. */
export async function cancelRun(runId: string): Promise<void> {
  await requestJson<unknown>("POST", `/runs/${encodeURIComponent(runId)}/cancel`);
}

/** `POST /complete` — a short-lived completion, never persisted. */
export async function complete(input: CompleteInput, signal?: AbortSignal): Promise<Response> {
  return requestStream("POST", "/complete", input, { signal });
}
