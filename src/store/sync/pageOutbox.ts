/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageOutbox.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Write side of the page OUTBOX: persist one page to the BaaS THROUGH the bridge
 * (PATCH /api/pages/:id → osionos_pages). The bridge applies fields per-key, so we send
 * the full editable record (title, parent, workspace, visibility, icon, cover, properties)
 * and OMIT `content` only when it is not loaded (never wiping server content). Never
 * throws — it returns a result the orchestrator uses to advance / forget / retry; the four
 * results ("ok" / "refused" / "gone" / "failed") are defined in ./publishResult.
 */

import { api, ApiError, API_BASE, getActivePageJwt } from "@/shared/api/client";
import type { PageEntry } from "@/entities/page";
import { ignoredFrom, publishResultFor, type PublishResult } from "./publishResult";

export type { PublishResult };

/** The editable fields the bridge persists; `content` only when it is actually loaded. */
function pageToPatchBody(page: PageEntry): Record<string, unknown> {
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
  if (page.content !== undefined) body.content = page.content;
  return body;
}

export async function publishPage(page: PageEntry): Promise<{ result: PublishResult; ignored: string[] }> {
  const jwt = getActivePageJwt();
  if (!jwt) return { result: "failed", ignored: [] }; // not signed in yet → stay pending, retry on the timer
  try {
    const body = await api.patch<unknown>(`/api/pages/${encodeURIComponent(page._id)}`, pageToPatchBody(page), jwt);
    return { result: "ok", ignored: ignoredFrom(body) };
  } catch (error) {
    return { result: error instanceof ApiError ? publishResultFor(error.status) : "failed", ignored: [] };
  }
}

/**
 * Best-effort UNLOAD publish: a raw `keepalive` fetch the browser completes
 * after the document is gone, so an edit made moments before a reload reaches
 * the server without waiting for the outbox debounce. Fire-and-forget by
 * design — the ledger is NOT advanced (nothing can confirm during unload), so
 * the next session's outbox re-publishes idempotently from the unconfirmed
 * pages kept under their own key (pendingPages), not from the page cache, which
 * a full origin refuses silently. A request dropped here (offline, a 5xx, or a
 * body over keepalive's ~64KB cap, which throws synchronously and is skipped)
 * therefore loses nothing unless that key was refused too — and then the
 * beforeunload guard asked the user to stay first.
 */
export function publishPageKeepalive(page: PageEntry): void {
  const jwt = getActivePageJwt();
  if (!jwt || !API_BASE) return;
  try {
    void fetch(`${API_BASE}/api/pages/${encodeURIComponent(page._id)}`, {
      method: "PATCH",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(pageToPatchBody(page)),
    }).catch(() => undefined);
  } catch {
    // oversized keepalive body or unavailable fetch — the outbox replays next load
  }
}
