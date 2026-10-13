/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageAccessEntry.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageEntry } from "@/entities/page";
import type { usePageStore } from "@/store/usePageStore";

export type PageStoreState = ReturnType<typeof usePageStore.getState>;

/** Access-relevant slice of a loaded page (null when not loaded). Kept to the
 *  fields canReadPage needs so shallow-equal selectors don't re-render on edits. */
export function selectPageAccessEntry(state: PageStoreState, pageId: string): PageEntry | null {
  const index = state.pagesIndex[pageId];
  const page = index ? state.pages[index.workspaceId]?.[index.index] : undefined;
  if (!page) return null;
  return {
    _id: page._id,
    title: page.title,
    icon: page.icon,
    workspaceId: page.workspaceId,
    ownerId: page.ownerId,
    visibility: page.visibility,
    collaborators: page.collaborators,
  };
}
