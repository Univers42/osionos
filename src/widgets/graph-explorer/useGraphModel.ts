/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useGraphModel.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Produce the GraphModel the new engine renders, reusing the Second Brain data
 * adapters: local canonical state via `deriveGraph`, or the live BaaS overview
 * (robust fetch in `useBaasGraph`) at parity with the legacy view. Surfaces the
 * editing handles (BaaS optimistic setter + local store mutator) and the BaaS
 * status (loading/offline/error/totals/retry/expand) the chrome needs.
 */

import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from "react";
import type { NotionState } from "@notion-db/object-database";
import { useKnownDatabaseStateStore } from "@/widgets/database-view/model/knownDatabaseState";
import { useUserStore } from "@/features/auth";
import { GRAPH_SOURCE } from "@/features/second-brain/featureFlag";
import { type GraphModel, type NodeId, emptyModel } from "@/features/second-brain/model/graphModel";
import { deriveGraph } from "@/features/second-brain/model/deriveGraph";
import { deriveTagConfig } from "@/features/second-brain/model/deriveTagConfig";
import type { GraphScope } from "@/features/second-brain/baas/pageGraphSource";
import { useBaasGraph } from "./useBaasGraph";
import { buildSyntheticModel, graphBenchCount } from "./syntheticGraph";

const EMPTY = emptyModel();
// Bench hook: `?graphBench=N` renders a deterministic synthetic model so FPS
// probes and visual tests don't depend on workspace contents.
const BENCH_COUNT = graphBenchCount();

// The graph scope is remembered across reloads (it used to reset to "workspace"
// every load, stranding users on a near-empty default workspace) and defaults to
// "all-data" — the whole multi-engine graph the session can see.
const GRAPH_SCOPE_KEY = "osionos:graph-scope";
const GRAPH_SCOPES: readonly GraphScope[] = ["workspace", "all", "all-data"];
function loadGraphScope(): GraphScope {
  try {
    const stored = localStorage.getItem(GRAPH_SCOPE_KEY) as GraphScope | null;
    return stored && GRAPH_SCOPES.includes(stored) ? stored : "all-data";
  } catch {
    return "all-data";
  }
}

export interface GraphData {
  model: GraphModel;
  baasMode: boolean;
  setBaasModel: Dispatch<SetStateAction<GraphModel | null>>;
  /** Local object-database state — null in BaaS mode, where it is never read. */
  state: NotionState | null;
  updatePageProperty: (recordId: string, propertyId: string, value: unknown) => void;
  viewerId: string | null;
  /** "workspace" = active workspace only (default); "all" = every workspace the user owns. */
  scope: GraphScope;
  setScope: (scope: GraphScope) => void;
  guarantee: string | null;
  loading: boolean;
  loadError: string | null;
  offline: boolean;
  totalNodes: number | null;
  retry: () => void;
  expand: (id: NodeId) => void;
}

export function useGraphModel(): GraphData {
  const updatePageProperty = useKnownDatabaseStateStore((store) => store.updatePageProperty);
  const viewerId = useUserStore((store) => store.activeUserId) || null;
  const activeWorkspaceId = useUserStore((store) => store.activeWorkspace()?._id ?? null);
  const [scope, setScopeState] = useState<GraphScope>(loadGraphScope);
  const setScope = useCallback((next: GraphScope) => {
    try { localStorage.setItem(GRAPH_SCOPE_KEY, next); } catch { /* private mode */ }
    setScopeState(next);
  }, []);
  // Use the canonical bridge note-graph whenever there's a logged-in workspace —
  // it does NOT depend on the (often-unset) edges DB config. "all-data" scope spans
  // every workspace; the local synthetic path is kept only for the ?graphBench probe.
  const baasMode = BENCH_COUNT === 0 && Boolean(viewerId) && Boolean(activeWorkspaceId);
  // In BaaS mode the bridge graph is authoritative and the local model is discarded
  // — select null so object-database edits don't re-render the explorer + console
  // for a model that would only be derived into the void.
  const state = useKnownDatabaseStateStore((store) => (baasMode ? null : store.state));
  const localModel = useMemo(
    () => {
      if (BENCH_COUNT > 0) return buildSyntheticModel(BENCH_COUNT);
      if (baasMode || !state) return EMPTY;
      return deriveGraph(state, { source: GRAPH_SOURCE, tagConfig: deriveTagConfig(state) });
    },
    [state, baasMode],
  );
  const baas = useBaasGraph(baasMode, viewerId, scope === "workspace" ? activeWorkspaceId : null, scope);
  const model = baasMode ? baas.model ?? EMPTY : localModel;

  return {
    model,
    baasMode,
    setBaasModel: baas.setModel,
    state,
    updatePageProperty,
    viewerId,
    scope,
    setScope,
    guarantee: baas.guarantee,
    loading: baasMode ? baas.loading : false,
    loadError: baasMode ? baas.loadError : null,
    offline: baasMode ? baas.offline : false,
    totalNodes: baasMode ? baas.totalNodes : null,
    retry: baas.retry,
    expand: baas.expand,
  };
}
