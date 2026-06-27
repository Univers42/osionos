/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   recordSubItems.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 06:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 06:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Notion-style sub-items for live-database records. A record in any engine mount
 * (`baas:<dbId>:<table>:<pk>` in the database view) can become an editable note
 * (the bridge upserts a deterministic record-note keyed by recordNoteId) and
 * carry hand-created child notes nested via `parent_page_id` — engine-agnostic,
 * schema-non-invasive (the source DB is never written). The bridge enforces the
 * mount ACL on every call; sub-items land in a workspace the caller controls.
 */

import type { PageEntry } from "@/entities/page";
import { api, getActivePageJwt } from "@/shared/api/client";
import { usePageStore } from "@/store/usePageStore";
import { derivePageState } from "@/store/pageStore.helpers";

export interface LiveRecordRef {
  dbId: string;
  table: string;
  pk: string;
}

export interface SubItemsResult {
  parentNoteId: string;
  children: PageEntry[];
}

export interface CreateSubItemInput {
  workspaceId: string;
  title?: string;
  icon?: string;
  properties?: unknown[];
  content?: unknown[];
}

const LIVE_PREFIX = "baas:";

/**
 * Parse an NDS live-mount page id (`baas:<dbId>:<table>:<pk>`) into its record
 * ref. dbId/table never contain `:`; the pk may (composite keys join on `:`), so
 * everything after the second `:` is the pk. Returns null for non-live ids
 * (workspace/object-database pages), so the caller can skip them.
 */
export function parseLiveRecordRef(nodePageId: string): LiveRecordRef | null {
  if (typeof nodePageId !== "string" || !nodePageId.startsWith(LIVE_PREFIX)) return null;
  const rest = nodePageId.slice(LIVE_PREFIX.length);
  const firstColon = rest.indexOf(":");
  if (firstColon < 0) return null;
  const afterDb = rest.slice(firstColon + 1);
  const secondColon = afterDb.indexOf(":");
  if (secondColon < 0) return null;
  const dbId = rest.slice(0, firstColon);
  const table = afterDb.slice(0, secondColon);
  const pk = afterDb.slice(secondColon + 1);
  if (!dbId || !table || !pk) return null;
  return { dbId, table, pk };
}

function recordBase(ref: LiveRecordRef): string {
  return `/api/records/${encodeURIComponent(ref.dbId)}/${encodeURIComponent(ref.table)}/${encodeURIComponent(ref.pk)}`;
}

/** Resolve-or-create the deterministic note backing a record (idempotent). */
export async function openRecordNote(ref: LiveRecordRef): Promise<PageEntry | null> {
  try {
    return await api.post<PageEntry>(`${recordBase(ref)}/open`, {}, getActivePageJwt() ?? undefined);
  } catch {
    return null;
  }
}

/** The caller's hand-created sub-item notes under a record (owner-scoped). */
export async function listSubItems(ref: LiveRecordRef): Promise<SubItemsResult> {
  try {
    const res = await api.get<SubItemsResult>(`${recordBase(ref)}/subitems`, getActivePageJwt() ?? undefined);
    return {
      parentNoteId: typeof res?.parentNoteId === "string" ? res.parentNoteId : "",
      children: Array.isArray(res?.children) ? res.children : [],
    };
  } catch {
    return { parentNoteId: "", children: [] };
  }
}

/** Create a sub-item note (its own metadata) under a record; the record-note is ensured first. */
export async function createSubItem(ref: LiveRecordRef, input: CreateSubItemInput): Promise<PageEntry | null> {
  try {
    return await api.post<PageEntry>(`${recordBase(ref)}/subitems`, input, getActivePageJwt() ?? undefined);
  } catch {
    return null;
  }
}

/**
 * Open a sub-item note as a page. A note created via the bridge is NOT yet in the
 * client page store, and `usePageStore.openPage` bails for a `kind:"page"` whose
 * entry is absent — so register the entry first (mirrors DatabaseObjectPage's
 * derivePageState upsert), then open it. No-ops without a workspace.
 */
export function openNotePage(entry: PageEntry): void {
  const ws = entry.workspaceId;
  if (!ws || !entry._id) return;
  usePageStore.setState((s) => {
    const existing = s.pages[ws] ?? [];
    if (existing.some((p) => p._id === entry._id)) return {};
    return derivePageState({ ...s.pages, [ws]: [...existing, entry] }, s.pageIdsByWorkspace);
  });
  usePageStore.getState().openPage({
    id: entry._id,
    workspaceId: ws,
    kind: "page",
    title: entry.title,
    icon: entry.icon ?? undefined,
  });
}
