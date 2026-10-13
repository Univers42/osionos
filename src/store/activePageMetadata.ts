/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   activePageMetadata.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ActivePage, PageStore } from "@/entities/page";

export type ActivePageMetadataPatch = Partial<Pick<ActivePage, "cover" | "coverPosition" | "icon" | "title">>;
type ActivePageSlice = Pick<PageStore, "activePage" | "navigationPath" | "recents">;

/** The active page, breadcrumb and recents with `patch` applied to `pageId`'s entries, as a
 *  partial state for the same `set` that changed the page; empty when `pageId` is not the
 *  active page. Folded into the page update itself because every extra `set` re-runs every
 *  mounted selector (tests/e2e/perf/titleTyping.spec.mjs). */
export function patchActivePageSlice(state: ActivePageSlice, pageId: string, patch: ActivePageMetadataPatch): Partial<ActivePageSlice> {
  if (state.activePage?.id !== pageId) return {};
  const apply = (entry: ActivePage) => (entry.id === pageId ? { ...entry, ...patch } : entry);
  return {
    activePage: { ...state.activePage, ...patch },
    navigationPath: state.navigationPath.map(apply),
    recents: state.recents.map(apply),
  };
}
