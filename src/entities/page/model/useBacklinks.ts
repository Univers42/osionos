/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useBacklinks.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useState } from "react";
import { api, getActivePageJwt } from "@/shared/api/client";
import { isBacklinksEnabled } from "@/shared/config/featureFlags";

export interface BacklinkRef {
  id: string;
  title: string;
  icon?: string | null;
}

interface Backlinks {
  linked: BacklinkRef[];
  mentions: BacklinkRef[];
}

const EMPTY: Backlinks = { linked: [], mentions: [] };

/** Inline [[page]] backlinks + unlinked mentions for a page (bridge FTS + links). */
export function useBacklinks(pageId: string): Backlinks {
  const [data, setData] = useState<Backlinks>(EMPTY);

  useEffect(() => {
    if (!isBacklinksEnabled() || !pageId) return; // initial state is already EMPTY
    let alive = true;
    api.get<{ linked?: BacklinkRef[]; mentions?: BacklinkRef[] }>(`/api/pages/${pageId}/backlinks`, getActivePageJwt() ?? undefined)
      .then((res) => { if (alive) setData({ linked: res.linked ?? [], mentions: res.mentions ?? [] }); })
      .catch(() => { if (alive) setData(EMPTY); });
    return () => { alive = false; };
  }, [pageId]);

  return data;
}
