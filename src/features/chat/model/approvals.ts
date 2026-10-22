/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   approvals.ts                                       :+:      :+:    :+:   */
/*                                                    +#+#+#+         +#+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +#+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */
/**
 * The approvals: the card of a write, and the decision of the user.
 *
 * A write the assistant asked for waits on the service. The card is what the
 * user sees, and the decision is what the user takes:
 *
 * - `GET /approvals/:id` answers the card, rebuilt from the row: the tool in
 *   words, the target by name, the arguments, the preview. It is the recovery
 *   path — the stream of the run lives fifteen minutes, the row lives longer.
 * - `POST /approvals/:id` takes the decision, and NOTHING ELSE: the body is
 *   `{ decision: 'approve' | 'decline' }`.
 *
 * The base URL and the bearer are the ones of the AI client — the assistant
 * is opt-in, and the card is part of it. The transport is the same shape as
 * the client's: the tests swap it, and the app never does.
 */

import { bearerFetch } from "@/shared/agent/bearerFetch";
import { getActivePageJwt } from "@/shared/api/client";
import { aiBaseUrl } from "@/features/ai/api/aiClient";

/** The minimal fetch shape, so a test can inject a stub without a network. */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/* -------------------------------------------------------------------------- */
/* The shapes of the service                                                   */
/* -------------------------------------------------------------------------- */

/** The states of an approval. */
export type ApprovalStatus =
  | "pending"
  | "executing"
  | "executed"
  | "failed"
  | "declined"
  | "expired"
  | "unknown";

/** The target of a write: the page, the title and the workspace. */
export interface ApprovalTarget {
  /** The page the write touches, when it touches one. */
  pageId?: string;
  /** The title the card shows: the new one for a rename, the current one otherwise. */
  title: string;
  /** The workspace the write lands in. */
  workspaceId: string;
  /** The name of that workspace, when the database knows it. */
  workspaceName: string;
}

/** What the preview of a write counts: the blocks of a page, or its sub-pages. */
export type ApprovalPreviewUnit = "blocks" | "sub_pages" | "none";

/** The preview of a write: a number, and what the number is. */
export interface ApprovalPreview {
  unit: ApprovalPreviewUnit;
  count: number;
}

/** The card of a write, as the service describes it. */
export interface ApprovalDescription {
  approvalId: string;
  /** The name of the tool the model called. */
  tool: string;
  /** The verb of the card, in plain words. */
  verb: string;
  status: ApprovalStatus;
  target: ApprovalTarget;
  /** The arguments, exactly as they will be written. */
  args: Record<string, unknown>;
  preview: ApprovalPreview;
  /** The number of the writes of this run that are already approved. */
  approvedInRun: number;
  /** When the question closes itself. */
  expiresAt: string;
  createdAt: string;
}

/** The decision of the user, and what came of it. */
export interface ApprovalDecision {
  ok: boolean;
  approvalId: string;
  status: ApprovalStatus;
  /** The outcome of the write: a short result, nothing more. */
  result: unknown;
  /** The reason of a failure: a safe message, never an internal. */
  error: string | null;
  /** The run the assistant continues in, when the write happened. */
  continuationRunId: string | null;
}

/** The two decisions the user may take. */
export type ApprovalChoice = "approve" | "decline";

/* -------------------------------------------------------------------------- */
/* The refusals                                                               */
/* -------------------------------------------------------------------------- */

/** A refusal of the service: the status and the code, never the internals. */
export class ApprovalError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "ApprovalError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Reads the refusal out of an error response.
 *
 * The envelope of the service is `{ ok: false, code, error: { code } }`: the
 * flat code and the nested one are both read, so a service that answers
 * either shape reaches the user with a code.
 */
async function toApprovalError(response: Response): Promise<ApprovalError> {
  let code = "unknown";
  try {
    const body = (await response.clone().json()) as
      | { code?: unknown; error?: { code?: unknown } }
      | null;
    const flat = body?.code;
    const nested = body?.error?.code;
    if (typeof flat === "string") code = flat;
    else if (typeof nested === "string") code = nested;
  } catch {
    // A refusal that is not JSON still has a status.
  }
  return new ApprovalError(response.status, code);
}

/* -------------------------------------------------------------------------- */
/* The transport                                                              */
/* -------------------------------------------------------------------------- */

/** The transport every route of the approvals uses: the session bearer. */
let transport: FetchLike = bearerFetch((input, init) => fetch(input, init), getActivePageJwt);

/** Swaps the transport. The tests use it; the app never calls it. */
export function setApprovalTransport(impl: FetchLike): void {
  transport = impl;
}

/** A route of the approvals: the answer, or the refusal. */
async function request(path: string, init: RequestInit): Promise<Response> {
  const response = await transport(`${aiBaseUrl()}${path}`, init);
  if (!response.ok) throw await toApprovalError(response);
  return response;
}

/* -------------------------------------------------------------------------- */
/* The routes                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `GET /approvals/:id` — the card of a write.
 *
 * The card survives the stream of the run: this is what a client asks when
 * it comes back later.
 */
export async function fetchApproval(approvalId: string): Promise<ApprovalDescription> {
  const response = await request(`/approvals/${encodeURIComponent(approvalId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return (await response.json()) as ApprovalDescription;
}

/**
 * `POST /approvals/:id` — the decision of the user.
 *
 * The body is the decision, and nothing else: a body that carries more than a
 * decision is a body that tries to be an argument, and the service refuses it.
 */
export async function decideApproval(
  approvalId: string,
  decision: ApprovalChoice,
): Promise<ApprovalDecision> {
  const response = await request(`/approvals/${encodeURIComponent(approvalId)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  return (await response.json()) as ApprovalDecision;
}
