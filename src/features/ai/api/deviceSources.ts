/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   deviceSources.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The sources a "This device" run reads: they come from osionos, never from
 * the engine. The engine URL and its key are not part of this request.
 */

import { requestJson } from "./aiClient";

/** One source, rebuilt as an explicit object of its six fields. */
export interface DeviceSource {
  pageId: string;
  blockId: string;
  title: string;
  headingPath: string;
  snippet: string;
  score: number;
}

/** The shape the service answers with. */
interface SourcesResponse {
  sources?: Array<{
    pageId?: unknown;
    blockId?: unknown;
    title?: unknown;
    headingPath?: unknown;
    snippet?: unknown;
    score?: unknown;
  }>;
}

/**
 * Asks osionos for the sources of a query. The engine key and the engine URL
 * never go into this request — only the query and the limit.
 */
export async function fetchDeviceSources(query: string, limit = 8): Promise<DeviceSource[]> {
  const body = await requestJson<SourcesResponse>("POST", "/sources", { query, limit });
  const list = Array.isArray(body?.sources) ? body.sources : [];
  return list.map((source) => {
    const score = typeof source?.score === "number" ? source.score : Number(source?.score);
    return {
      pageId: String(source?.pageId ?? ""),
      blockId: String(source?.blockId ?? ""),
      title: String(source?.title ?? ""),
      headingPath: String(source?.headingPath ?? ""),
      snippet: String(source?.snippet ?? ""),
      score: Number.isFinite(score) ? score : 0,
    };
  });
}
