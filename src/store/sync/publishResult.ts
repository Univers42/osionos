/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   publishResult.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * What the outbox learned from one PATCH /api/pages/:id. Pure, so the status mapping is
 * tested without the API client (which reads import.meta.env at load).
 *   "ok"       → written; advance the ledger. `ignored` lists the fields the bridge declined.
 *   "refused"  → 403: the page exists but this viewer may not write it (read-only, revoked).
 *   "gone"     → 404: the page no longer exists server-side; forget it, keep the local copy.
 *   "conflict" → 409: the server's copy moved under the client; merge it and re-send (bounded).
 *   "failed"   → transient (offline / 5xx / 401 / 429 / no session / a malformed 409);
 *                leave the page pending and retry.
 *
 * The conflict is read through the ONE channel the transport already has: the ApiError
 * the http-gate client throws carries the error body's `details` (packages/http-gate/
 * src/client.ts). The shape is PINNED, never guessed: a 409 whose details do not hold a
 * version (a plain non-negative integer) and a content array is not a conflict — it is a
 * failure like any other, because a merge needs both halves of the base.
 */

import { ApiError } from "@osionos/http-gate";
import type { Block } from "@/entities/block";

export type PublishResult = "ok" | "refused" | "gone" | "failed" | "conflict";

/** The server's copy a 409 carried: the version it is at, and the content it holds. */
export interface VersionConflict {
  /** The server's content version — the base the client's re-send is pinned to. */
  version: number;
  /** The server's content, block for block — the third side of the merge. */
  content: Block[];
}

/** What one PATCH learned. */
export interface PublishOutcome {
  result: PublishResult;
  /** The fields the bridge declined (a partially applied PATCH). */
  ignored: string[];
  /** The version the server answered (a 200), or the conflict's version (a 409). */
  version: number | null;
  /** The server's copy — on a conflict only. */
  conflict: VersionConflict | null;
}

export function publishResultFor(status: number): PublishResult {
  if (status === 403) return "refused";
  if (status === 404) return "gone";
  return "failed";
}

/** The response body's `ignored` field list (string items only); anything else → []. */
export function ignoredFrom(body: unknown): string[] {
  if (typeof body !== "object" || body === null) return [];
  const raw = (body as { ignored?: unknown }).ignored;
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
}

/** The version a 200 answered (null while the database has no version column yet). */
export function versionFrom(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const version = (body as { version?: unknown }).version;
  return typeof version === "number" && Number.isSafeInteger(version) && version >= 0 ? version : null;
}

/**
 * The conflict a 409 carried, or null: any other status, any other code, and any body
 * whose details do not pin the shape (a version AND a content array) is not a conflict
 * the client may act on — it is a failure, and the page stays pending (C19).
 */
export function conflictFrom(error: unknown): VersionConflict | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status !== 409 || error.code !== "version_conflict") return null;
  const details = error.details;
  if (typeof details !== "object" || details === null) return null;
  const { version, content } = details as { version?: unknown; content?: unknown };
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) return null;
  if (!Array.isArray(content)) return null;
  return { version, content: content as Block[] };
}
