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
import { isUuidId } from "@/store/pageStore.helpers";

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
/** Backlinks for one page. Only real pages have any: virtual surfaces such as the
 *  `home-dashboard:<workspaceId>` home id are not rows, and the bridge answers a non-UUID
 *  id with 422 — which the console showed on every home load. Those, and a request with no
 *  session token yet, resolve to EMPTY without a network call. */
export function useBacklinks(pageId: string): Backlinks {
  const [data, setData] = useState<Backlinks>(EMPTY);

  useEffect(() => {
    if (!isBacklinksEnabled() || !isUuidId(pageId)) return; // initial state is already EMPTY
    const jwt = getActivePageJwt();
    if (!jwt) return;
    let alive = true;
    api.get<{ linked?: BacklinkRef[]; mentions?: BacklinkRef[] }>(`/api/pages/${pageId}/backlinks`, jwt)
      .then((res) => { if (alive) setData({ linked: res.linked ?? [], mentions: res.mentions ?? [] }); })
      .catch(() => { if (alive) setData(EMPTY); });
    return () => { alive = false; };
  }, [pageId]);

  return data;
}
