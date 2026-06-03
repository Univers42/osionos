/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   noteScope.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { usePageStore } from "@/store/usePageStore";
import { noteRowId } from "../baas/publishNote";

/** Pages that should appear as notes: non-archived, non-database content pages. */
export function isContentNote(page: {
  archivedAt?: string | null;
  databaseId?: string | null;
  surface?: string;
}): boolean {
  return !page.archivedAt && !page.databaseId && (page.surface ?? "page") === "page";
}

/**
 * The note row ids (`osio-note-<pageId>`) currently in the page store — i.e. the
 * viewer's OWN notes, the exact set the sidebar renders. The graph filters its note
 * layer to this set so the graph's notes mirror the sidebar by construction (a
 * shared/public note owned by ANOTHER user is in og_notes but not here → not shown).
 */
export function liveNoteRowIds(): Set<string> {
  const ids = new Set<string>();
  for (const list of Object.values(usePageStore.getState().pages)) {
    for (const page of list) {
      if (isContentNote(page)) ids.add(noteRowId(page._id));
    }
  }
  return ids;
}
