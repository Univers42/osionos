/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   hydrateNotes.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { usePageStore } from "@/store/usePageStore";
import { derivePageState, savePagesCache } from "@/store/pageStore.helpers";
import type { PageEntry } from "@/entities/page/model/types";
import { baasPost } from "../baas/baasFetch";
import { notesMount, notesTable } from "../baas/baasGraphClient";

/**
 * Local-first READ path: the BaaS notes collection is the source of truth, the
 * page store (zustand + localStorage) is a cache. On load we pull THIS user's own
 * notes and restore any that aren't in localStorage — so a note survives a cache
 * clear or shows up on a fresh device. Owner-scoped: only the viewer's own notes
 * are ever restored into the viewer's sidebar (others' notes stay protected; in
 * production each user reads with their own identity and the BaaS enforces it).
 *
 * Merge policy = last-write-wins by `updatedAt`: ADD notes missing locally,
 * UPDATE a local note only when the server copy is strictly newer (so a local
 * edit that hasn't synced yet is never clobbered by a stale server row).
 */

const NOTE_PREFIX = "osio-note-";

interface NoteRow {
  id?: unknown;
  title?: unknown;
  contentJson?: unknown;
  visibility?: unknown;
  owner?: unknown;
  workspaceId?: unknown;
  parentPageId?: unknown;
  updatedAt?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseContent(value: unknown): PageEntry["content"] {
  const raw = asString(value);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PageEntry["content"]) : [];
  } catch {
    return [];
  }
}

function rowToPage(row: NoteRow): PageEntry | null {
  const id = asString(row.id);
  const workspaceId = asString(row.workspaceId);
  if (!id || !id.startsWith(NOTE_PREFIX) || !workspaceId) return null; // can't place it
  return {
    _id: id.slice(NOTE_PREFIX.length),
    title: asString(row.title) ?? "Untitled",
    content: parseContent(row.contentJson),
    workspaceId,
    ownerId: asString(row.owner) ?? null,
    visibility: (asString(row.visibility) as PageEntry["visibility"]) ?? "private",
    parentPageId: asString(row.parentPageId) ?? null,
    updatedAt: asString(row.updatedAt),
    surface: "page",
    collaborators: [],
  };
}

/** Merge restored notes into the page store: ADD missing, newer server copy wins. */
function mergeIntoStore(restored: PageEntry[]): number {
  if (restored.length === 0) return 0;
  let changed = 0;
  usePageStore.setState((state) => {
    const pages: Record<string, PageEntry[]> = { ...state.pages };
    for (const page of restored) {
      const bucket = pages[page.workspaceId] ? [...pages[page.workspaceId]] : [];
      const index = bucket.findIndex((existing) => existing._id === page._id);
      if (index === -1) {
        bucket.push(page);
        changed += 1;
      } else if ((page.updatedAt ?? "") > (bucket[index].updatedAt ?? "")) {
        bucket[index] = { ...bucket[index], ...page };
        changed += 1;
      }
      pages[page.workspaceId] = bucket;
    }
    if (changed > 0) savePagesCache(pages);
    return derivePageState(pages, state.pageIdsByWorkspace);
  });
  return changed;
}

/** Pull the viewer's own notes from the BaaS and restore any missing locally. */
export async function hydrateNotesFromBaas(viewerId: string | null): Promise<number> {
  const mount = notesMount();
  if (!mount || !viewerId) return 0;
  const response = await baasPost<{ rows?: NoteRow[]; data?: NoteRow[] }>(
    `/query/v1/${mount}/tables/${notesTable()}`,
    { op: "list", limit: 500 }, // BaaS caps list at 500
  );
  const restored = (response.rows ?? response.data ?? [])
    .filter((row) => asString(row.owner) === viewerId)
    .map(rowToPage)
    .filter((page): page is PageEntry => page !== null);
  return mergeIntoStore(restored);
}
