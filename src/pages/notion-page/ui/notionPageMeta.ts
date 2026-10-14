/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   notionPageMeta.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { usePageStore } from "@/store/usePageStore";
import { patchActivePageSlice, type ActivePageMetadataPatch } from "@/store/activePageMetadata";

/** Keep the active page / breadcrumb / recents entries in sync with a metadata change. */
export function patchActivePageMetadata(pageId: string, patch: ActivePageMetadataPatch) {
  usePageStore.setState((state) => patchActivePageSlice(state, pageId, patch));
}
