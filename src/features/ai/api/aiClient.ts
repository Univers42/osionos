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
import { conversationFromWire, messageFromWire, summaryFromBody, type ConversationSummary, type ConversationWire, type MessageWire } from "./aiWire";
import type {
  AiAgent,
  AiAgentSettings,
  AiWebSettings,
  AiBuiltinAgent,
  AiCustomAgent,
  CreateAgentInput,
  UpdateAgentInput,
  AiAccessScope,
  AiAccessToken,
  AiAccessTokenCreated,
  AiMcpDiscovery,
  AiMcpServer,
  AiMcpTool,
  AiCommand,
  AiConnection,
  AiConversation,
  AiMessage,
  AiModel,
  AiPart,
  AiProvider,
  AiUsage,
  CompleteInput,
  CreateAccessTokenInput,
  CreateConnectionInput,
  CreateMcpServerInput,
  StartRunInput,
  UpdateMcpServerInput,
} from "./aiContract";
import { bearerFetch } from "@/shared/agent/bearerFetch";
import { getActivePageJwt, reportRevokedSession } from "@/shared/api/client";
import { revocationAwareFetch } from "@/shared/api/sessionRevocation";

/** The minimal fetch shape, so a test can inject a stub without a network. */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/* The shapes of the contract and its refusal are re-exported here: the
   callers of the client read them from one place. */
export { AiError };
export type {
  AiAgent,
  AiAgentSettings,
  AiWebSettings,
  AiBuiltinAgent,
  AiCustomAgent,
  CreateAgentInput,
  UpdateAgentInput,
  AiAccessScope,
  AiAccessToken,
  AiAccessTokenCreated,
  AiMcpDiscovery,
  AiMcpServer,
  AiMcpTool,
  AiCommand,
  AiConnection,
  AiConversation,
  AiMessage,
  AiModel,
  AiPart,
  AiProvider,
  AiUsage,
  CompleteInput,
  CreateAccessTokenInput,
  CreateConnectionInput,
  CreateMcpServerInput,
  StartRunInput,
  UpdateMcpServerInput,
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

/**
 * The JSON transport of the service.
 *
 * It is exported so a route that lives in its own module (relatedPages.ts)
 * rides the SAME transport — the session bearer, the base URL, the refusal
 * envelope — instead of copying it.
 */
export async function requestJson<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
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

/**
 * `GET /agents` — the built-in agents: the shapes a run can take.
 *
 * The list never carries the instructions of an agent: they are the text of
 * the server's prompt, and the browser does not hold them.
 */
export async function listAgents(): Promise<AiAgent[]> {
  const body = await requestJson<AiAgent[]>("GET", "/agents");
  return Array.isArray(body) ? body : [];
}

const agentPath = (id: string) => `/agents/${encodeURIComponent(id)}`;
const settingsPath = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/agents/settings`;

/** `GET /agents/:id` — one custom agent; `instructions` only when the caller may run it. */
export async function getAgent(id: string): Promise<AiCustomAgent> {
  return requestJson<AiCustomAgent>("GET", agentPath(id));
}

/** `POST /agents` — a custom agent; the answer carries its instructions. */
export async function createAgent(input: CreateAgentInput): Promise<AiCustomAgent> {
  return requestJson<AiCustomAgent>("POST", "/agents", input);
}

/** `PATCH /agents/:id` — a new version; 409 `version_conflict` when somebody saved first. */
export async function updateAgent(id: string, input: UpdateAgentInput): Promise<AiCustomAgent> {
  return requestJson<AiCustomAgent>("PATCH", agentPath(id), input);
}

/** `DELETE /agents/:id` — archives the agent (terminal in v1). */
export async function archiveAgent(id: string): Promise<void> {
  await requestNoContent("DELETE", agentPath(id));
}

/** `GET /workspaces/:ws/agents/settings` — 404 when the feature is off on this deployment. */
export async function getAgentSettings(workspaceId: string): Promise<AiAgentSettings> {
  return requestJson<AiAgentSettings>("GET", settingsPath(workspaceId));
}

/** `PUT /workspaces/:ws/agents/settings` — both keys, admins only (403 otherwise). */
export async function putAgentSettings(workspaceId: string, settings: AiAgentSettings): Promise<AiAgentSettings> {
  return requestJson<AiAgentSettings>("PUT", settingsPath(workspaceId), settings);
}

const webSettingsPath = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/web/settings`;

/** `GET /workspaces/:ws/web/settings` — 404 when the web tools are off on this deployment, or the caller is no member. */
export async function getWebSettings(workspaceId: string): Promise<AiWebSettings> {
  return requestJson<AiWebSettings>("GET", webSettingsPath(workspaceId));
}

/**
 * `PUT /workspaces/:ws/web/settings` — owner or admin, session under 10 minutes old.
 * `acknowledged: true` is always sent: the caller is the confirm step of the
 * disclosure, and nothing else calls this.
 */
export async function putWebSettings(workspaceId: string, enabled: boolean): Promise<AiWebSettings> {
  return requestJson<AiWebSettings>("PUT", webSettingsPath(workspaceId), { enabled, acknowledged: true });
}

/** `POST /conversations` — a conversation of the workspace. */
export async function createConversation(input: { workspaceId: string; title?: string }): Promise<AiConversation> {
  return conversationFromWire(await requestJson<ConversationWire>("POST", "/conversations", input));
}

/** `GET /conversations?workspaceId=` — the caller's conversations, newest first. */
export async function listConversations(workspaceId: string): Promise<AiConversation[]> {
  const body = await requestJson<{ conversations?: ConversationWire[] }>(
    "GET",
    `/conversations?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return (body.conversations ?? []).map(conversationFromWire);
}

/** `PATCH /conversations/:id` — a new title on a conversation the caller owns. */
export async function renameConversation(id: string, title: string): Promise<AiConversation> {
  return conversationFromWire(
    await requestJson<ConversationWire>("PATCH", `/conversations/${encodeURIComponent(id)}`, { title }),
  );
}

/** `DELETE /conversations/:id` — archives the conversation: it leaves the list. */
export async function deleteConversation(id: string): Promise<void> {
  await requestJson<unknown>("DELETE", `/conversations/${encodeURIComponent(id)}`);
}

/**
 * `GET /conversations/:id/messages` — the transcript, oldest first, and the
 * summary the service keeps of it (`undefined`: the service sent no key).
 */
export async function getTranscript(conversationId: string): Promise<{ messages: AiMessage[]; summary: ConversationSummary | null | undefined }> {
  const body = await requestJson<{ messages?: MessageWire[] }>(
    "GET",
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
  );
  return { messages: (body.messages ?? []).map(messageFromWire), summary: summaryFromBody(body) };
}

/** `DELETE /conversations/:id/summary` — the owner clears the summary; 404 when the flag is off. */
export async function clearConversationSummary(conversationId: string): Promise<void> {
  await requestJson<unknown>("DELETE", `/conversations/${encodeURIComponent(conversationId)}/summary`);
}

/** `POST /runs` — the run's event stream. */
export async function startRun(input: StartRunInput, signal?: AbortSignal): Promise<Response> {
  return requestStream("POST", "/runs", input, { signal });
}

/**
 * `POST /thread-runs` — an "@AI" draft for a channel message the caller wrote
 * (C429). The service reads the channel itself; the body names only the run,
 * the caller's conversation, the channel and the trigger message.
 */
export async function startThreadRun(
  input: { runId: string; conversationId: string; channelId: string; messageId: string },
  signal?: AbortSignal,
): Promise<Response> {
  return requestStream("POST", "/thread-runs", input, { signal });
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

/**
 * `POST /images` — the stream of one image run: `image.queued`, `image.started`,
 * `image.done`, then `done` or `error`.
 *
 * The runId is the client's own: a re-POST with the SAME id replays the old run
 * (refusal included), so a retry must carry a NEW one.
 */
export async function startImage(input: { runId: string; prompt: string }, signal?: AbortSignal): Promise<Response> {
  return requestStream("POST", "/images", input, { signal });
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

/** The `/health` body, where `db` and `redis` each read "ok" or "down". */
export function healthOf(body: { ok?: boolean; db?: string; redis?: string }): { ok: boolean; db: boolean; redis: boolean } {
  return { ok: body.ok === true, db: body.db === "ok", redis: body.redis === "ok" };
}

/** `GET /health` — whether the service, its database and its cache answer. */
export async function getHealth(): Promise<{ ok: boolean; db: boolean; redis: boolean }> {
  return healthOf(await requestJson<{ ok?: boolean; db?: string; redis?: string }>("GET", "/health"));
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

/* -------------------------------------------------------------------------- */
/* The personal access tokens (G4a)                                           */
/* -------------------------------------------------------------------------- */

/**
 * `GET /access-tokens` — the tokens of the user.
 *
 * The list carries the last four characters of each token and never the token
 * itself: the service does not have it any more (C112).
 */
export async function listAccessTokens(): Promise<AiAccessToken[]> {
  const body = await requestJson<{ tokens?: AiAccessToken[] }>("GET", "/access-tokens");
  return body.tokens ?? [];
}

/**
 * `POST /access-tokens` — a new token.
 *
 * The answer is the ONLY place the token appears: the browser shows it once
 * and forgets it. The service needs a FRESH session for this (C113), and
 * refuses with `reauth_required` when the session is too old.
 */
export async function createAccessToken(
  input: CreateAccessTokenInput,
): Promise<AiAccessTokenCreated> {
  return requestJson<AiAccessTokenCreated>("POST", "/access-tokens", {
    name: input.name,
    scopes: input.scopes,
    workspaceIds: input.workspaceIds,
    expiresInDays: input.expiresInDays,
  });
}

/** `DELETE /access-tokens/:id` — the token is revoked. */
export async function revokeAccessToken(id: string): Promise<void> {
  await requestNoContent("DELETE", `/access-tokens/${encodeURIComponent(id)}`);
}

/* -------------------------------------------------------------------------- */
/* MCP servers                                                                 */
/* -------------------------------------------------------------------------- */

/** `GET /mcp-servers` — the servers of the user; a 404 means the feature is off (C288). */
export async function listMcpServers(): Promise<AiMcpServer[]> {
  const body = await requestJson<{ servers?: AiMcpServer[] }>("GET", "/mcp-servers");
  return body.servers ?? [];
}

/** `POST /mcp-servers` — registers a server; the header value is sealed by the service. */
export async function createMcpServer(input: CreateMcpServerInput): Promise<AiMcpServer> {
  return requestJson<AiMcpServer>("POST", "/mcp-servers", input);
}

/** `PATCH /mcp-servers/:id` — a label, or a new address with its header (C270). */
export async function updateMcpServer(id: string, input: UpdateMcpServerInput): Promise<AiMcpServer> {
  return requestJson<AiMcpServer>("PATCH", `/mcp-servers/${encodeURIComponent(id)}`, input);
}

/** `DELETE /mcp-servers/:id` — the server and its tools are gone. */
export async function deleteMcpServer(id: string): Promise<void> {
  await requestNoContent("DELETE", `/mcp-servers/${encodeURIComponent(id)}`);
}

/** `POST /mcp-servers/:id/discover` — lists the tools of the server; each new one is off. */
export async function discoverMcpServer(id: string): Promise<AiMcpDiscovery> {
  return requestJson<AiMcpDiscovery>("POST", `/mcp-servers/${encodeURIComponent(id)}/discover`);
}

/** `PATCH /mcp-servers/:id/tools/:name` — one tool on or off. */
export async function setMcpToolEnabled(id: string, name: string, enabled: boolean): Promise<boolean> {
  const body = await requestJson<{ enabled: boolean }>(
    "PATCH",
    `/mcp-servers/${encodeURIComponent(id)}/tools/${encodeURIComponent(name)}`,
    { enabled },
  );
  return body.enabled;
}

/* -------------------------------------------------------------------------- */
/* Workspace skills                                                            */
/* -------------------------------------------------------------------------- */

/** A skill of a workspace, with its body (members read, owners/admins write). */
export interface AiWorkspaceSkill {
  id: string;
  slug: string;
  name: string;
  description: string;
  body: string;
  version: number;
  updatedAt: string;
  /** Whether the prompt offers it: the index is capped. */
  inIndex: boolean;
}

/** The fields an owner/admin writes. */
export interface AiSkillFields {
  name: string;
  description: string;
  body: string;
}

const skillsPath = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/skills`;

/** `GET /workspaces/:ws/skills` */
export async function listWorkspaceSkills(workspaceId: string): Promise<AiWorkspaceSkill[]> {
  const body = await requestJson<{ skills?: AiWorkspaceSkill[] }>("GET", skillsPath(workspaceId));
  return body.skills ?? [];
}

/** `POST /workspaces/:ws/skills` */
export async function createWorkspaceSkill(
  workspaceId: string,
  input: AiSkillFields & { slug: string },
): Promise<AiWorkspaceSkill> {
  return requestJson<AiWorkspaceSkill>("POST", skillsPath(workspaceId), input);
}

/** `PUT /workspaces/:ws/skills/:slug` — a new version. */
export async function updateWorkspaceSkill(
  workspaceId: string,
  slug: string,
  input: AiSkillFields,
): Promise<AiWorkspaceSkill> {
  return requestJson<AiWorkspaceSkill>("PUT", `${skillsPath(workspaceId)}/${encodeURIComponent(slug)}`, input);
}

/** `DELETE /workspaces/:ws/skills/:slug` — archives. */
export async function archiveWorkspaceSkill(workspaceId: string, slug: string): Promise<void> {
  await requestNoContent("DELETE", `${skillsPath(workspaceId)}/${encodeURIComponent(slug)}`);
}
