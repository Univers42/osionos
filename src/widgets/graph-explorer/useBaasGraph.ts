/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useBaasGraph.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * BaaS-mode graph data for the new view, at parity with the legacy SecondBrainView:
 * a retrying bootstrap of the bounded overview, an offline snapshot fallback with
 * reconnect polling, live refresh after local edits, true per-resource totals via
 * aggregate, and expand-on-demand (double-click) that merges a node's neighborhood.
 */

import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePageStore } from "@/store/usePageStore";
import { type GraphModel, type NodeId, emptyModel } from "@/features/second-brain/model/graphModel";
import { mapGraphResponse } from "@/features/second-brain/baas/mapGraphResponse";
import { accumulateGraph } from "@/features/second-brain/baas/accumulateGraph";
import { configuredResources, edgesMount, fetchGraphFocus } from "@/features/second-brain/baas/baasGraphClient";
import { type GraphScope, PAGE_GRAPH_RESOURCE, fetchCombinedOverview } from "@/features/second-brain/baas/pageGraphSource";
import { aggregateCount } from "@/features/second-brain/baas/baasAggregate";
import { parseNodeId } from "@/features/second-brain/baas/buildRecordTxn";
import { BaasError } from "@/features/second-brain/baas/baasFetch";
import type { BaasGraphResponse } from "@/features/second-brain/baas/types";
import { loadGraphSnapshot, saveGraphSnapshot } from "@/features/second-brain/sync/graphSnapshot";

const EMPTY = emptyModel();
const RECONNECT_POLL_MS = 15_000;

/** Cheap identity of a wire response (lengths + djb2 of the JSON) so identical
 *  refetches — the common case for the 2.5s edit-refresh and the reconnect poll —
 *  skip the remap, the engine rebuild, and the localStorage snapshot write. */
function responseSignature(response: BaasGraphResponse): string {
  const raw = JSON.stringify(response);
  let hash = 5381;
  for (let i = 0; i < raw.length; i += 1) hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  return `${response.nodes.length}:${response.edges.length}:${hash}`;
}

export interface BaasGraphState {
  model: GraphModel | null;
  setModel: Dispatch<SetStateAction<GraphModel | null>>;
  guarantee: string | null;
  loading: boolean;
  loadError: string | null;
  offline: boolean;
  totalNodes: number | null;
  retry: () => void;
  expand: (id: NodeId) => void;
}

export function useBaasGraph(
  enabled: boolean,
  viewerId: string | null,
  workspaceId: string | null,
  scope: GraphScope,
): BaasGraphState {
  const noteResources = useMemo(() => new Set([PAGE_GRAPH_RESOURCE]), []);
  const [model, setModel] = useState<GraphModel | null>(null);
  const [guarantee, setGuarantee] = useState<string | null>(null);
  const [totalNodes, setTotalNodes] = useState<number | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const lastApplied = useRef<string | null>(null);

  // Bootstrap the bounded overview, retrying transient failures; on persistent
  // failure render the last-good snapshot read-only (never a silent void).
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const options = { noteResources, viewerId };
    const apply = (response: BaasGraphResponse, fromCache: boolean): void => {
      // viewerId is part of the signature because the mapping depends on it —
      // the same wire bytes map differently for a different viewer.
      const signature = `${viewerId ?? ""}|${responseSignature(response)}`;
      if (signature !== lastApplied.current) {
        lastApplied.current = signature;
        const mapped = mapGraphResponse(response, options);
        setModel(mapped.model);
        setGuarantee(mapped.guarantee);
        if (!fromCache) saveGraphSnapshot(response);
      }
      // Status flags always update — an identical payload can still mean an
      // offline→online transition (or vice versa).
      setOffline(fromCache);
      setLoadError(null);
      setLoading(false);
    };
    const fallback = (error: unknown): void => {
      const snapshot = loadGraphSnapshot();
      if (snapshot) apply(snapshot.response, true);
      else {
        setLoadError(error instanceof BaasError ? `BaaS ${error.status}: ${error.message}` : "couldn't reach the BaaS");
        setOffline(false);
        setLoading(false);
      }
    };
    void (async () => {
      for (let attempt = 0; attempt < 4 && active; attempt += 1) {
        try {
          const response = await fetchCombinedOverview(workspaceId, scope);
          if (!active) return;
          apply(response, false); // snapshot save happens inside, only when the data changed
          return;
        } catch (error) {
          if (!active) return;
          if (attempt === 3) fallback(error);
          else await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [enabled, noteResources, viewerId, workspaceId, scope, reloadKey]);

  // While offline, poll for the server's return so the graph self-heals.
  useEffect(() => {
    if (!enabled || !offline) return;
    const interval = setInterval(() => setReloadKey((key) => key + 1), RECONNECT_POLL_MS);
    return () => clearInterval(interval);
  }, [enabled, offline]);

  // Live refresh: re-fetch shortly after a local page edit lands in the outbox.
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = usePageStore.subscribe((state, previous) => {
      // Only page edits matter; activePage / recents / loadingIds churn leaves
      // `pages` and `pageRevisions` referentially unchanged (same skip as
      // usePageSync) — without it every store write scheduled a full refetch.
      if (state.pages === previous.pages && state.pageRevisions === previous.pageRevisions) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setReloadKey((key) => key + 1), 2500);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [enabled]);

  // True per-resource totals via aggregate (the overview is a bounded sample).
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Promise.allSettled(
      configuredResources()
        .filter((resource) => resource.dbId === edgesMount())
        .map((resource) => aggregateCount(resource.dbId, resource.table)),
    )
      .then((results) => {
        if (!active) return;
        const total = results.reduce((sum, r) => sum + (r.status === "fulfilled" ? r.value : 0), 0);
        if (total > 0) setTotalNodes(total);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled]);

  const retry = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setReloadKey((key) => key + 1);
  }, []);

  const expand = useCallback((id: NodeId) => {
    if (!enabled || parseNodeId(id).resource === PAGE_GRAPH_RESOURCE) return;
    fetchGraphFocus(id)
      .then((response) => {
        const mapped = mapGraphResponse(response, { noteResources, viewerId });
        setModel((prev) => accumulateGraph(prev ?? EMPTY, mapped.model));
        setGuarantee(mapped.guarantee);
      })
      .catch(() => undefined);
  }, [enabled, noteResources, viewerId]);

  return { model, setModel, guarantee, loading, loadError, offline, totalNodes, retry, expand };
}
