/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   notionPageMeta.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ActivePage } from "@/entities/page";
import { usePageStore } from "@/store/usePageStore";

export type ActivePageMetadataPatch = Partial<Pick<ActivePage, "cover" | "coverPosition" | "icon" | "title">>;

/** Keep the active page / breadcrumb / recents entries in sync with a metadata change. */
export function patchActivePageMetadata(pageId: string, patch: ActivePageMetadataPatch) {
  usePageStore.setState((state) => {
    if (state.activePage?.id !== pageId) return {};
    const activePage = { ...state.activePage, ...patch };
    return {
      activePage,
      navigationPath: state.navigationPath.map((entry) => (entry.id === pageId ? { ...entry, ...patch } : entry)),
      recents: state.recents.map((entry) => (entry.id === pageId ? { ...entry, ...patch } : entry)),
    };
  });
}
