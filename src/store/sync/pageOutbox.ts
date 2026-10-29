/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageOutbox.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Write side of the page OUTBOX: persist one page to the BaaS THROUGH the bridge
 * (PATCH /api/pages/:id → osionos_pages). The bridge applies fields per-key, so we send
 * the full editable record (title, parent, workspace, visibility, icon, cover, properties)
 * and OMIT `content` only when it is not loaded (never wiping server content). Never
 * throws — it returns a result the orchestrator uses to advance / forget / retry; the
 * five results ("ok" / "refused" / "gone" / "conflict" / "failed") are defined in
 * ./publishResult.
 *
 * The PATCH carries the BASE VERSION: the version of the page's content the client last
 * saw (./pageBase). The bridge refuses a stale one with a 409 that carries the server's
 * own copy, so two writers merge instead of erasing each other. The version travels ONLY
 * with content: a metadata-only write says nothing about the content, so it must not
 * claim a version (and must not be refused for one).
 */

import { api, ApiError, API_BASE, getActivePageJwt } from "@/shared/api/client";
import type { PageEntry } from "@/entities/page";
import { baseFor, setBase } from "./pageBase";
import {
  conflictFrom,
  ignoredFrom,
  publishResultFor,
  versionFrom,
  type PublishOutcome,
  type PublishResult,
  type VersionConflict,
} from "./publishResult";

export type { PublishOutcome, PublishResult, VersionConflict };

/**
 * The bridge calls the outbox makes. Injected so the canvas runner can drive a whole
 * flush without a network (the real ones read the session and the api client).
 */
export interface OutboxDeps {
  /** The page-audience JWT, or null when there is no session yet. */
  token(): string | null;
  /** PATCH one page through the bridge; the parsed answer comes back. */
  patch(path: string, body: Record<string, unknown>, jwt: string): Promise<unknown>;
  /** The bridge origin ("" when the app runs without a bridge). */
  base(): string;
  /** The unload keepalive: a raw PATCH the browser completes after the document is gone. */
  keepalive(path: string, body: Record<string, unknown>, jwt: string): void;
}

const realDeps: OutboxDeps = {
  token: getActivePageJwt,
  patch: (path, body, jwt) => api.patch(path, body, jwt),
  base: () => API_BASE,
  keepalive: (path, body, jwt) => {
    void fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  },
};

/** The editable fields the bridge persists; `content` only when it is actually loaded. */
function pageToPatchBody(page: PageEntry, baseVersion: number | null): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: page.title,
    parentPageId: page.parentPageId ?? null,
    sortOrder: page.sortOrder ?? null,
    workspaceId: page.workspaceId,
    visibility: page.visibility ?? "private",
    icon: page.icon ?? null,
    cover: page.cover ?? null,
    properties: page.properties ?? [],
  };
  // Only send the cover focal point once the user has actually repositioned a
  // cover, so ordinary pages never depend on the `cover_position` column (a
  // backend that lags the migration still accepts every other page write).
  if (typeof page.coverPosition === "number") body.coverPosition = page.coverPosition;
  // Only template pages carry these columns; omit them for ordinary pages so a
  // backend whose schema predates the template migration still accepts the write.
  // (A template page sends all three — including `false`/`null` — so clearing the
  // default or recurrence persists.)
  if (page.isTemplate || page.isDefaultTemplate || page.recurrence) {
    body.isTemplate = page.isTemplate ?? false;
    body.isDefaultTemplate = page.isDefaultTemplate ?? false;
    body.recurrence = page.recurrence ?? null;
  }
  // The client's own edit stamp. The bridge persists it as updated_at (future-
  // clamped) so hydrate's last-write-wins compares browser-clock against
  // browser-clock; without it the server stamped ITS clock and any host/VM
  // skew let a stale server copy clobber fresher local edits on reload.
  if (typeof page.updatedAt === "string" && page.updatedAt) body.updatedAt = page.updatedAt;
  const carriesContent = page.content !== undefined;
  if (carriesContent) body.content = page.content;
  // The version this edit was made against — with the content, and only with it: the
  // bridge refuses a stale one (a 409 with the server's copy), so a metadata-only
  // write must never claim a version it does not depend on.
  if (carriesContent && baseVersion !== null) body.baseVersion = baseVersion;
  return body;
}

/**
 * Publish one page. A 200 advances the base: the server now holds exactly what was
 * sent, at the version it answered. A 409 leaves the base alone — the merge needs it —
 * and hands the server's copy to the caller.
 */
export async function publishPage(
  page: PageEntry,
  deps: OutboxDeps = realDeps,
): Promise<PublishOutcome> {
  const jwt = deps.token();
  if (!jwt) return { result: "failed", ignored: [], version: null, conflict: null }; // not signed in yet → stay pending, retry on the timer
  const base = baseFor(page);
  try {
    const answer = await deps.patch(
      `/api/pages/${encodeURIComponent(page._id)}`,
      pageToPatchBody(page, base.version),
      jwt,
    );
    const version = versionFrom(answer);
    setBase(page._id, version ?? base.version, page.content ?? null);
    return { result: "ok", ignored: ignoredFrom(answer), version, conflict: null };
  } catch (error) {
    const conflict = conflictFrom(error);
    if (conflict) return { result: "conflict", ignored: [], version: conflict.version, conflict };
    return {
      result: error instanceof ApiError ? publishResultFor(error.status) : "failed",
      ignored: [],
      version: null,
      conflict: null,
    };
  }
}

/**
 * Best-effort UNLOAD publish: a raw `keepalive` fetch the browser completes
 * after the document is gone, so an edit made moments before a reload reaches
 * the server without waiting for the outbox debounce. Fire-and-forget by
 * design — the ledger is NOT advanced (nothing can confirm during unload), so
 * the next session's outbox publishes again from the unconfirmed pages kept
 * under their own key (pendingPages), not from the page cache, which a full
 * origin refuses silently.
 *
 * It carries the base version like every other write: a stale one is refused by
 * the bridge, so the keepalive never overwrites a copy that moved — the edit
 * stays pending and the next load replays it through the conflict path (C29).
 * The answer is ignored (nothing can confirm during unload), so a 409 is
 * invisible here: the pending copy is what carries the edit to the next load.
 */
export function publishPageKeepalive(page: PageEntry, deps: OutboxDeps = realDeps): void {
  const jwt = deps.token();
  if (!jwt || !deps.base()) return;
  try {
    deps.keepalive(
      `/api/pages/${encodeURIComponent(page._id)}`,
      pageToPatchBody(page, baseFor(page).version),
      jwt,
    );
  } catch {
    // oversized keepalive body or unavailable fetch — the outbox replays next load
  }
}
