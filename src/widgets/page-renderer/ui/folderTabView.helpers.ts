/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   folderTabView.helpers.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/16 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/16 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/store/usePageStore";

export type FolderChild = Pick<PageEntry, "_id" | "title" | "icon" | "surface" | "databaseId" | "workspaceId">;

/** The live (non-archived) children of a folder page, as the store's own entries.
 *  Returning the stored objects is what keeps a useShallow subscription stable: copying
 *  them into fresh `{ _id, title, … }` objects made every call unequal to the last, and
 *  opening any non-empty folder re-rendered until React threw #185. */
export function selectFolderChildren(pages: readonly PageEntry[], folderId: string): PageEntry[] {
  return pages.filter((p) => p.parentPageId === folderId && !p.archivedAt);
}
