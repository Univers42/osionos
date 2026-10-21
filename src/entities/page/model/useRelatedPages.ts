/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useRelatedPages.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useEffect, useState } from "react";

import { isAiConfigured } from "@/features/ai/api/aiClient";
import { listRelatedPages } from "@/features/ai/api/relatedPages";
import { isUuidId } from "@/store/pageStore.helpers";

/** One page related to the one that is open. */
export interface RelatedRef {
  /** The id of the page. */
  pageId: string;
  /** Its title. */
  title: string;
  /** The cosine similarity of the two pages, from 0 to 1. */
  score: number;
  /** Whether the open page already links to it. */
  linked: boolean;
}

/** What the panel shows while it waits, and what it shows when it fails. */
export type RelatedState = "idle" | "loading" | "ready" | "error";

interface RelatedPages {
  /** The state of the read. */
  state: RelatedState;
  /** The pages the service found, in the order of their distance. */
  related: RelatedRef[];
}

/**
 * The pages related to the one that is open.
 *
 * The list is the caller's own: the service computes it for the session, and
 * a page the caller may not read is never in it. Nothing is written: the
 * panel only reads.
 */
export function useRelatedPages(pageId: string, k = 8): RelatedPages {
  const [data, setData] = useState<{ key: string; state: RelatedState; related: RelatedRef[] }>({
    key: "",
    state: "idle",
    related: [],
  });
  const key = `${pageId}:${k}`;
  const wanted = isAiConfigured() && isUuidId(pageId);

  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    listRelatedPages(pageId, k)
      .then((pages) => {
        if (alive) setData({ key, state: "ready", related: pages });
      })
      .catch(() => {
        if (alive) setData({ key, state: "error", related: [] });
      });
    return () => {
      alive = false;
    };
  }, [pageId, k, key, wanted]);

  // The answer of another page is not the answer of this one: while the read
  // is on its way, the panel waits instead of showing the previous list.
  if (data.key !== key) return { state: wanted ? "loading" : "idle", related: [] };
  return { state: data.state, related: data.related };
}
