/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   relatedPages.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/21 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/21 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The client of the related pages.
 *
 * The route lives in its own module, beside the other clients of the service
 * but OUT of aiClient.ts: the client of the service is the transport and the
 * shapes of the contract, and the related pages are one route of it.
 *
 * The transport is NOT copied: `requestJson` comes from aiClient.ts, so the
 * session bearer, the base URL and the refusal envelope are the ones every
 * other AI route uses.
 */

import { requestJson } from "./aiClient";

/**
 * One page related to another, for the caller who asks.
 *
 * The neighbours are computed by the service for this caller at the moment of
 * the read: a page the caller may not read is never in it, and it is not a
 * "missing" one either.
 */
export interface AiRelatedPage {
  /** The id of the page. */
  pageId: string;
  /** Its title. */
  title: string;
  /** The cosine similarity of the two pages, from 0 to 1. */
  score: number;
  /** Whether the page already links to it. */
  linked: boolean;
}

/**
 * `GET /pages/:id/related?k=` — the pages related to a page, for the caller.
 *
 * The list is computed by the service for this caller: a page the caller may
 * not read is never in it.
 */
export async function listRelatedPages(pageId: string, k = 8): Promise<AiRelatedPage[]> {
  const body = await requestJson<{ related?: AiRelatedPage[] }>(
    "GET",
    `/pages/${encodeURIComponent(pageId)}/related?k=${k}`,
  );
  return body.related ?? [];
}
