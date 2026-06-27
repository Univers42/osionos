/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   graphSnapshot.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { BaasGraphResponse } from "../baas/types";

/**
 * Last-good graph cache. Every successful overview fetch is stashed in
 * localStorage; when the BaaS is unreachable, the view renders this snapshot
 * (read-only) instead of a void graph, so the app stays usable during an outage.
 * The overview is bounded (~400 nodes) so the payload is localStorage-sized.
 */

const SNAPSHOT_KEY = "osio-sb-graph-snapshot";

export interface GraphSnapshot {
  /** Epoch ms of the last successful fetch. */
  at: number;
  response: BaasGraphResponse;
}

export function saveGraphSnapshot(response: BaasGraphResponse): void {
  try {
    globalThis.localStorage?.setItem(SNAPSHOT_KEY, JSON.stringify({ at: Date.now(), response }));
  } catch {
    // Quota or unavailable — offline fallback simply won't have a cache this run.
  }
}

export function loadGraphSnapshot(): GraphSnapshot | null {
  try {
    const raw = globalThis.localStorage?.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "response" in parsed) return parsed as GraphSnapshot;
    return null;
  } catch {
    return null;
  }
}
