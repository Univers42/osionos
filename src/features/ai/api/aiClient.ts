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

import { AiError, toAiError } from "./aiContract";
import type {
  AiCommand,
  AiConnection,
  AiConversation,
  AiMessage,
  AiModel,
  AiPart,
  AiProvider,
  AiUsage,
  CompleteInput,
  CreateConnectionInput,
  StartRunInput,
} from "./aiContract";
import { bearerFetch } from "@/shared/agent/bearerFetch";
import { getActivePageJwt } from "@/shared/api/client";

/** The minimal fetch shape, so a test can inject a stub without a network. */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/* The shapes of the contract and its refusal are re-exported here: the
   callers of the client read them from one place. */
export { AiError };
export type {
  AiCommand,
  AiConnection,
  AiConversation,
  AiMessage,
  AiModel,
  AiPart,
  AiProvider,
  AiUsage,
  CompleteInput,
  CreateConnectionInput,
  StartRunInput,
};
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

/** The transport every route uses: the session bearer, like the agent stream. */
let transport: FetchLike = bearerFetch((input, init) => fetch(input, init), getActivePageJwt);

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
