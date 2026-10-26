/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   aiContract.ts                                      :+:      :+:    :+:   */
/*                                                    :+: :+:         :+:     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  :+:       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The contract of the AI service: the shapes of the wire, and the refusal.
 *
 * They live in their own file: the client is the transport, and a file that
 * carries both the shapes and the routes grows past what a reader can hold.
 */

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
  /** Whether the model can see images. */
  vision?: boolean;
  /** Whether the model reasons, so a run may ask for an effort. */
  reasoning?: boolean;
  /** The context window, in tokens, when the service knows it. */
  contextWindow?: number;
  /** The price of a million input tokens, in micro dollars. */
  inputMicroUsdPerMTok?: number;
  /** The price of a million output tokens, in micro dollars. */
  outputMicroUsdPerMTok?: number;
  /** ISO time until which the model rests after repeated failures; absent when it does not. */
  cooldownUntil?: string;
}

/**
 * A built-in agent: a shape of the assistant, chosen for one run.
 *
 * The list NEVER carries the instructions: they are the text of the server's
 * prompt, and the browser has no business holding them.
 */
export interface AiBuiltinAgent {
  /** Absent on a built-in: the service sends `kind` on custom agents only. */
  kind?: "builtin";
  /** The id the run carries: `db-architect`, `doc-writer`, `analyst`. */
  id: string;
  /** The version of the instructions — pinned on the run. */
  version: number;
  /** The name the reader sees. */
  name: string;
  /** One line: what the agent is for. */
  description: string;
}

/**
 * An agent a user or a workspace admin wrote. `instructions` is present only
 * on `GET /agents/:id`, and only for who may run the agent (a viewer sees none).
 */
export interface AiCustomAgent {
  kind: "custom";
  /** The uuid a run carries. */
  id: string;
  scope: "user" | "workspace";
  workspaceId: string | null;
  name: string;
  description: string;
  tools: string[];
  skills: string[];
  version: number;
  archived: boolean;
  /** The author lost the right to write for the workspace: a run is refused until an admin saves it. */
  needsReview: boolean;
  instructions?: string;
}

/** An agent a run can take: a built-in, or a custom one. */
export type AiAgent = AiBuiltinAgent | AiCustomAgent;

/** The body of `POST /agents`: exactly these keys, the service refuses any other (C332). */
export interface CreateAgentInput {
  scope: "user" | "workspace";
  workspaceId?: string;
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  skills: string[];
}

/** The body of `PATCH /agents/:id`. */
export interface UpdateAgentInput {
  expectedVersion: number;
  name?: string;
  description?: string;
  instructions?: string;
  tools?: string[];
  skills?: string[];
}

/** The switches of a workspace, as the service enforces them (C305). */
export interface AiAgentSettings {
  agents_enabled: boolean;
  custom_agents_allowed: boolean;
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

/* -------------------------------------------------------------------------- */
/* The personal access tokens (G4a)                                           */
/* -------------------------------------------------------------------------- */

/** What a personal access token may do. */
export type AiAccessScope = "read" | "write_approval";

/**
 * A personal access token of the user, as the settings list shows it.
 *
 * The token itself is NEVER here: the list carries the last four characters
 * and the rest of the row, and the token appears in the answer of the mint
 * only (C112).
 */
export interface AiAccessToken {
  id: string;
  name: string;
  /** The last four characters of the token — the only part we ever see again. */
  last4: string;
  scopes: AiAccessScope[];
  workspaceIds: string[];
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** The body of a mint: what the token may do, and where it may reach. */
export interface CreateAccessTokenInput {
  name: string;
  scopes: AiAccessScope[];
  workspaceIds: string[];
  expiresInDays: number;
}

/**
 * The answer of a mint: the token, ONCE.
 *
 * The service never gives it back: the settings page shows it, the user
 * copies it, and it is gone (C112).
 */
export interface AiAccessTokenCreated extends AiAccessToken {
  token: string;
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
  | {
      type: "citation";
      n?: number;
      /** Absent means a page: the only collection stored before packs. */
      collection?: "page";
      pageId: string;
      blockId?: string;
      title: string;
      snippet: string;
    }
  | { type: "citation"; n?: number; collection: "pack"; pack: string; title: string; snippet: string };

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

/** A model a run may move to: a connection of the caller (or the platform) and its model. */
export interface AiFallback {
  connectionId?: string;
  model: string;
}

/** The data of the `route` event: the run moved from one model to the next. */
export interface AiRouteEvent {
  from: string;
  to: string;
  reason: "rate_limited" | "upstream_error" | "unavailable";
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
   * The agent that shapes the run: one of the built-ins.
   *
   * Absent is the general assistant — the run of today, byte for byte.
   */
  agentId?: string;
  /**
   * The models the run moves to, in order (at most two), when the model before
   * them fails before it said anything. Absent is the run of today.
   */
  fallbacks?: AiFallback[];
  /** How hard a reasoning model thinks; sent only for a model that reasons. */
  effort?: "low" | "medium" | "high";
  attachments?: Array<{ kind: "chat"; id: string } | { kind: "media"; path: string; name?: string }>;
  /** Edit & resend: the service drops this run's turn and every later one first. */
  replaceFromRunId?: string;
  /**
   * What the answer is read from: the pages it may use (at most three), and
   * whether the caller's whole workspace is searched.
   */
  context?: { pageIds?: string[]; workspace?: boolean; account?: boolean; view?: {
    route: string;
    layout: "single" | "split";
    activePage?: { id: string; title: string };
    tabs?: { title: string; kind: "page" | "database" | "app" | "other"; pageId?: string }[];
    panel?: string;
  } };
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
/* The MCP servers of the user                                                */
/* -------------------------------------------------------------------------- */

/** A tool of a server: off until the user switches it on. */
export interface AiMcpTool {
  name: string;
  description: string;
  enabled: boolean;
}

/** A server as the list shows it: the host, never the URL, never the secret (C271). */
export interface AiMcpServer {
  id: string;
  label: string;
  host: string;
  status: "new" | "ok" | "failing" | "broken";
  headerName: string | null;
  headerLast4: string | null;
  /** While the service pauses the server after 3 failures, until when (ISO); null otherwise. */
  brokenUntil: string | null;
  tools: AiMcpTool[];
}

/** The body of `POST /mcp-servers`. */
export interface CreateMcpServerInput {
  label: string;
  url: string;
  headerName?: string;
  headerValue?: string;
  /** The disclosure was ticked (C282); the service refuses a create without it. */
  acknowledged: true;
}

/** The body of `PATCH /mcp-servers/:id`: a new `url` travels with `headerValue` (C270). */
export interface UpdateMcpServerInput {
  label?: string;
  url?: string;
  headerName?: string;
  headerValue?: string;
}

/** The answer of `POST /mcp-servers/:id/discover`. */
export interface AiMcpDiscovery {
  tools: AiMcpTool[];
  /** Tools the server listed that broke a cap and were left out. */
  refused: number;
}

/* -------------------------------------------------------------------------- */
/* The errors                                                                 */
/* -------------------------------------------------------------------------- */

/** A refusal from the service: the status and the contract's code. */
export class AiError extends Error {
  readonly status: number;
  readonly code: string;
  /**
   * The headers of the refusal: the `Retry-After` of a rate limit is read
   * from them, and the seconds it says are what the notice counts down.
   */
  readonly headers?: Headers;

  constructor(status: number, code: string, message?: string, headers?: Headers) {
    super(message || code);
    this.name = "AiError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

/**
 * Reads the refusal out of an error response. The contract's envelope is
 * `{ "error": { "code" } }`; a flat `{ "code" }` is read too, so a service that
 * answers the older shape still reaches the user with a code.
 */
export async function toAiError(response: Response): Promise<AiError> {
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
  return new AiError(response.status, code, message, response.headers);
}
