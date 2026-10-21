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
 * function per route, the base URL is `${VITE_AI_URL}/api/ai` — the assistant
 * is OPT-IN and `VITE_AI_URL` is the only switch — and every route but
 * `/health` carries the session bearer — the same one the agent stream
 * already sends.
 *
 * Nothing here knows about providers: the browser never talks to one.
 */

import { bearerFetch } from "@/shared/agent/bearerFetch";
import { getActivePageJwt, reportRevokedSession } from "@/shared/api/client";
import { revocationAwareFetch } from "@/shared/api/sessionRevocation";

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
  /** The context window, in tokens, when the service knows it. */
  contextWindow?: number;
  /** The price of a million input tokens, in micro dollars. */
  inputMicroUsdPerMTok?: number;
  /** The price of a million output tokens, in micro dollars. */
  outputMicroUsdPerMTok?: number;
}

/* -------------------------------------------------------------------------- */
/* The connections (the v2 additions of the wire contract)                    */
/* -------------------------------------------------------------------------- */

/**
 * A provider of models the service knows. `supported` says whether the server
 * has an adapter for the provider's wire format — an unsupported one can be
 * seen, but not connected.
 */
export interface AiProvider {
  id: string;
  name: string;
  kind: "api_key" | "oauth" | "endpoint";
  supported: boolean;
  docUrl?: string;
  modelCount: number;
}

/**
 * How a user brings their own model access. The platform connection (our key,
 * our daily budget) always exists, with the id `platform`.
 *
 * A secret NEVER reaches the browser: the service answers with `last4` only.
 */
export interface AiConnection {
  id: string;
  kind: "platform" | "api_key" | "oauth" | "endpoint";
  provider: string;
  label: string;
  baseUrl?: string;
  /** The last four characters of the key — the only part of it we ever see. */
  last4?: string;
  status: "ok" | "error" | "untested";
  statusMessage?: string;
  createdAt: string;
}

/** The body of `POST /connections` — an API key, or an endpoint of the user's. */
export type CreateConnectionInput =
  | { kind: "api_key"; provider: string; apiKey: string; label?: string }
  | { kind: "endpoint"; label: string; baseUrl: string; apiKey?: string };

/** The platform's usage for the day — ours only, never the user's own spend. */
export interface AiUsage {
  /** The day the usage is about (YYYY-MM-DD). */
  day: string;
  spentMicroUsd: number;
  limitMicroUsd: number;
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
  /** The connection the run spends — `platform` when the caller does not say. */
  connectionId?: string;
  /**
   * What the answer is read from: the pages it may use (at most three), and
   * whether the caller's whole workspace is searched.
   */
  context?: { pageIds?: string[]; workspace?: boolean };
}

/** The body of `POST /complete` — an inline editor action, never persisted. */
export interface CompleteInput {
  runId: string;
  command: string;
  input: { text: string };
  model?: string;
  /** The connection the completion spends — `platform` when the caller does not say. */
  connectionId?: string;
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

/**
 * The base URL of the service, without a trailing slash.
 *
 * `VITE_AI_URL` is the ONLY switch, and it is empty unless a build asks for
 * the assistant. There is NO fallback to the bridge's URL: `VITE_API_URL` and
 * `VITE_OSIONOS_BRIDGE_URL` are set in EVERY build, so a fallback would make
 * `isAiConfigured()` true everywhere — every build would show the AI actions
 * of the slash menu and swap the chat port to the AI service even where none
 * runs, and every AI action would fail.
 */
function serviceBase(): string {
  const env = (import.meta.env ?? {}) as Record<string, string>;
  const base = (env["VITE_AI_URL"] ?? "").trim();
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

/**
 * The transport every route uses: the session bearer, like the agent stream.
 *
 * The revocation check is inside it, so the run stream reports a `session_revoked`
 * 401 like every other AI route: `startRun` and `resumeRun` go through
 * `requestStream`, which goes through this transport -- they do not fetch on their
 * own, the way the bridge's own agent stream does (packages/http-gate/src/sse.ts).
 */
let transport: FetchLike = bearerFetch(
  revocationAwareFetch((input, init) => fetch(input, init), reportRevokedSession),
  getActivePageJwt,
);

/** Swaps the transport. The tests use it; the app never calls it. */
export function setAiTransport(impl: FetchLike): void {
  transport = impl;
}

async function requestJson<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const response = await transport(`${aiBaseUrl()}${path}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw await toAiError(response);
  return (await response.json()) as T;
}

/** A route that answers with no content (204): the body is never read. */
async function requestNoContent(method: "DELETE", path: string): Promise<void> {
  const response = await transport(`${aiBaseUrl()}${path}`, {
    method,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw await toAiError(response);
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

/** `GET /models` — the platform's allowlist, or the models of one connection. */
export async function listModels(connectionId?: string): Promise<AiModel[]> {
  const query = connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : "";
  const body = await requestJson<{ models?: AiModel[] }>("GET", `/models${query}`);
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

/* -------------------------------------------------------------------------- */
/* The connections (the v2 additions of the wire contract)                    */
/* -------------------------------------------------------------------------- */

/** `GET /providers` — the catalog of model providers the service knows. */
export async function listProviders(): Promise<AiProvider[]> {
  const body = await requestJson<{ providers?: AiProvider[] }>("GET", "/providers");
  return body.providers ?? [];
}

/** `GET /connections` — the user's connections, the platform one first. */
export async function listConnections(): Promise<AiConnection[]> {
  const body = await requestJson<{ connections?: AiConnection[] }>("GET", "/connections");
  return body.connections ?? [];
}

/**
 * `POST /connections` — a new connection. The key goes straight to the
 * service: the browser keeps it in memory for the length of the call and
 * never writes it down.
 */
export async function createConnection(input: CreateConnectionInput): Promise<AiConnection> {
  return requestJson<AiConnection>("POST", "/connections", input);
}

/** `POST /connections/:id/test` — the connection, with a fresh status. */
export async function testConnection(id: string): Promise<AiConnection> {
  return requestJson<AiConnection>("POST", `/connections/${encodeURIComponent(id)}/test`);
}

/** `DELETE /connections/:id` — the connection is gone. */
export async function deleteConnection(id: string): Promise<void> {
  await requestNoContent("DELETE", `/connections/${encodeURIComponent(id)}`);
}

/**
 * `POST /connections/oauth/openrouter/start` — the URL the browser must go to.
 * The service keeps the PKCE verifier and the `state` for ten minutes.
 */
export async function startOpenRouterOAuth(returnUrl: string): Promise<string> {
  const body = await requestJson<{ url?: string }>("POST", "/connections/oauth/openrouter/start", { returnUrl });
  if (!body.url) {
    throw new AiError(502, "oauth_failed", "The service did not give an OpenRouter sign-in URL.");
  }
  return body.url;
}

/** `POST /connections/oauth/openrouter/complete` — the signed-in connection. */
export async function completeOpenRouterOAuth(code: string, state: string): Promise<AiConnection> {
  return requestJson<AiConnection>("POST", "/connections/oauth/openrouter/complete", { code, state });
}

/** `GET /usage` — the platform's usage for the day. */
export async function getUsage(): Promise<AiUsage> {
  const body = await requestJson<Partial<AiUsage>>("GET", "/usage");
  return {
    day: body.day ?? "",
    spentMicroUsd: body.spentMicroUsd ?? 0,
    limitMicroUsd: body.limitMicroUsd ?? 0,
  };
}
