/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   liveSubItemsController.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 08:20:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 08:20:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Bridges the live-record sub-items model to the ObjectDatabase table's sub-items
 * controller. A record row's sub-items are its real child RECORDS (self-FK rows,
 * carried as `pageId` so the table fills their columns) followed by its
 * hand-created note sub-items (title-only). Opening resolves a child record id to
 * its note, or a note id from the fetch cache; creating adds a note in the
 * caller's active workspace.
 */

import type { ObjectDatabaseSubItemRow, ObjectDatabaseSubItemsController } from "@notion-db/object-database";
import type { PageEntry } from "@/entities/page";
import { useUserStore } from "@/features/auth";
import { createSubItem, listSubItems, openNotePage, openRecordNote, parseLiveRecordRef } from "./recordSubItems";
import { childRecordLabel, fetchSelfRefInfo, listChildRecords } from "./liveChildRecords";

export function createLiveSubItemsController(): ObjectDatabaseSubItemsController {
  const noteCache = new Map<string, PageEntry>();
  return {
    fetchRows: async (recordId) => {
      const ref = parseLiveRecordRef(recordId);
      if (!ref) return [];
      const [subRes, selfInfo] = await Promise.all([listSubItems(ref), fetchSelfRefInfo(ref)]);
      const rows: ObjectDatabaseSubItemRow[] = [];
      if (selfInfo) {
        const kids = await listChildRecords(ref, selfInfo);
        for (const kid of kids) {
          const pk = String(kid[selfInfo.pkCol] ?? "");
          if (!pk) continue;
          const childId = `baas:${ref.dbId}:${ref.table}:${pk}`;
          rows.push({ id: childId, title: childRecordLabel(kid, selfInfo.pkCol), pageId: childId });
        }
      }
      for (const note of subRes.children) {
        noteCache.set(note._id, note);
        rows.push({ id: note._id, title: note.title || "Untitled", icon: note.icon ?? undefined });
      }
      return rows;
    },
    openRow: (subItemId) => {
      const childRef = parseLiveRecordRef(subItemId);
      if (childRef) {
        void openRecordNote(childRef).then((note) => { if (note) openNotePage(note); });
        return;
      }
      const note = noteCache.get(subItemId);
      if (note) openNotePage(note);
    },
    createRow: async (recordId) => {
      const ref = parseLiveRecordRef(recordId);
      if (!ref) return;
      const ws = useUserStore.getState().activeWorkspace()?._id;
      if (!ws) return;
      await createSubItem(ref, { workspaceId: ws, title: "Sub-item" });
    },
  };
}
