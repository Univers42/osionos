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
 * throws — it returns a result the orchestrator uses to advance / forget / retry:
 *   "ok"     → written; advance the ledger.
 *   "gone"   → 404/403 (deleted or not owned server-side); forget it, keep the local copy.
 *   "failed" → transient (offline / 5xx / 401 / no session); leave pending and retry.
 */

import { api, ApiError, getActivePageJwt } from "@/shared/api/client";
import type { PageEntry } from "@/entities/page";

export type PublishResult = "ok" | "gone" | "failed";

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
  if (page.content !== undefined) body.content = page.content;
  return body;
}

export async function publishPage(page: PageEntry): Promise<PublishResult> {
  const jwt = getActivePageJwt();
  if (!jwt) return "failed"; // not signed in yet → stay pending, retry on the timer
  try {
    await api.patch(`/api/pages/${encodeURIComponent(page._id)}`, pageToPatchBody(page), jwt);
    return "ok";
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      return "gone";
    }
    return "failed";
  }
}
