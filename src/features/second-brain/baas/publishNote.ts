/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   publishNote.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { baasPost } from "./baasFetch";
import { edgesMount, edgesTable, notesMount, notesTable } from "./baasGraphClient";
import { type TextBlock, blockText } from "../model/noteTags";

/**
 * Publish one osionos note (page) into the graph as a SINGLE note node — a node
 * that carries note context, never a twin of a data node. A note is **orphan by
 * default**; its only automatic relationship is the page **hierarchy** (a
 * child→parent "parent" edge), which makes the recursive note forest visible.
 * Tags are NOT auto-generated (that caused title→tag-hub duplicates and a
 * hairball); a note connects by tags only when it carries real ones.
 *
 * The note row is an idempotent Mongo upsert; the parent edge is an idempotent
 * upsert into the (PG) edges mount. Safe to call on every save (debounced).
 */

export interface PublishableNote {
  id: string;
  title: string;
  blocks?: TextBlock[];
  /** Parent note's row id (`osio-note-<parentPageId>`) when the parent is a note. */
  parentNoteId?: string | null;
  /** Real, explicit tags only — never auto-derived from content. */
  tags?: string[];
  /** "private" | "shared" | "public" — the real note attribute. */
  visibility?: string;
  /** Logical owner (osionos user id) — for per-user scoping / privacy. */
  owner?: string | null;
  /** Workspace the note belongs to (to restore it into the right place). */
  workspaceId?: string;
  /** ISO timestamp for last-write-wins on hydration. */
  updatedAt?: string;
  /** Raw parent page id (for restoring the sidebar tree). */
  parentPageId?: string | null;
}

/** Stable graph id for a note, matching the seed-sync convention. */
export function noteRowId(pageId: string): string {
  return `osio-note-${pageId}`;
}

function parentEdgeId(pageId: string): string {
  return `osio-noteparent-${pageId}`;
}

export async function publishNote(note: PublishableNote): Promise<void> {
  const mount = notesMount();
  if (!mount) return; // notes collection not configured → nothing to publish to

  const id = noteRowId(note.id);
  const title = note.title || "Untitled";
  const body = blockText(note.blocks).replace(/\s+/g, " ").trim().slice(0, 600);
  await baasPost(`/query/v1/${mount}/tables/${notesTable()}`, {
    op: "upsert",
    filter: { id },
    data: {
      id,
      title,
      body, // flattened text — for the graph's note_link generator
      contentJson: JSON.stringify(note.blocks ?? []), // full blocks — for faithful restore
      tags: note.tags ?? [],
      visibility: note.visibility ?? "private",
      owner: note.owner ?? null,
      workspaceId: note.workspaceId ?? "",
      parentPageId: note.parentPageId ?? null,
      updatedAt: note.updatedAt ?? new Date().toISOString(),
    },
  });

  // Hierarchy: child→parent edge (recursive forest). Upsert when there's a
  // parent note; otherwise drop any stale parent edge so re-parenting is clean.
  const edgeId = parentEdgeId(note.id);
  if (note.parentNoteId) {
    await baasPost(`/query/v1/${edgesMount()}/tables/${edgesTable()}`, {
      op: "upsert",
      filter: { id: edgeId },
      data: {
        id: edgeId,
        from: `${mount}:${notesTable()}:${id}`,
        to: `${mount}:${notesTable()}:${note.parentNoteId}`,
        type: "parent",
      },
    });
  } else {
    await baasPost(`/query/v1/${edgesMount()}/tables/${edgesTable()}`, { op: "delete", filter: { id: edgeId } }).catch(() => undefined);
  }
}

/** Remove a note (and its parent edge) from the graph. */
export async function unpublishNote(pageId: string): Promise<void> {
  await deleteNoteRow(noteRowId(pageId));
}

/** List the note row ids currently in the graph (owner-scoped). */
export async function listNoteRowIds(): Promise<string[]> {
  const mount = notesMount();
  if (!mount) return [];
  const response = await baasPost<{ rows?: { id?: unknown }[]; data?: { id?: unknown }[] }>(
    `/query/v1/${mount}/tables/${notesTable()}`,
    { op: "list", limit: 500 },
  );
  return (response.rows ?? response.data ?? [])
    .map((row) => (typeof row.id === "string" ? row.id : ""))
    .filter(Boolean);
}

/** Delete a note row (by its graph id) and its parent edge. */
export async function deleteNoteRow(rowId: string): Promise<void> {
  const mount = notesMount();
  if (!mount) return;
  const pageId = rowId.startsWith("osio-note-") ? rowId.slice("osio-note-".length) : rowId;
  await baasPost(`/query/v1/${mount}/tables/${notesTable()}`, { op: "delete", filter: { id: rowId } }).catch(() => undefined);
  await baasPost(`/query/v1/${edgesMount()}/tables/${edgesTable()}`, { op: "delete", filter: { id: parentEdgeId(pageId) } }).catch(() => undefined);
}
