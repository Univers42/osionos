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

import { type Dispatch, type SetStateAction, useMemo } from "react";
import type { NotionState } from "@notion-db/object-database";
import { useKnownDatabaseStateStore } from "@/widgets/database-view/model/knownDatabaseState";
import { useUserStore } from "@/features/auth";
import { GRAPH_SOURCE } from "@/features/second-brain/featureFlag";
import { type GraphModel, type NodeId, emptyModel } from "@/features/second-brain/model/graphModel";
import { deriveGraph } from "@/features/second-brain/model/deriveGraph";
import { deriveTagConfig } from "@/features/second-brain/model/deriveTagConfig";
import { isBaasGraphEnabled } from "@/features/second-brain/baas/baasGraphClient";
import { useBaasGraph } from "./useBaasGraph";
import { buildSyntheticModel, graphBenchCount } from "./syntheticGraph";

const EMPTY = emptyModel();
// Bench hook: `?graphBench=N` renders a deterministic synthetic model so FPS
// probes and visual tests don't depend on workspace contents.
const BENCH_COUNT = graphBenchCount();

export interface GraphData {
  model: GraphModel;
  baasMode: boolean;
  setBaasModel: Dispatch<SetStateAction<GraphModel | null>>;
  state: NotionState;
  updatePageProperty: (recordId: string, propertyId: string, value: unknown) => void;
  viewerId: string | null;
  guarantee: string | null;
  loading: boolean;
  loadError: string | null;
  offline: boolean;
  totalNodes: number | null;
  retry: () => void;
  expand: (id: NodeId) => void;
}

export function useGraphModel(): GraphData {
  const state = useKnownDatabaseStateStore((store) => store.state);
  const updatePageProperty = useKnownDatabaseStateStore((store) => store.updatePageProperty);
  const baasMode = isBaasGraphEnabled() && BENCH_COUNT === 0;
  const viewerId = useUserStore((store) => store.activeUserId) || null;
  const localModel = useMemo(
    () => (BENCH_COUNT > 0
      ? buildSyntheticModel(BENCH_COUNT)
      : deriveGraph(state, { source: GRAPH_SOURCE, tagConfig: deriveTagConfig(state) })),
    [state],
  );
  const baas = useBaasGraph(baasMode, viewerId);
  const model = baasMode ? baas.model ?? EMPTY : localModel;

  return {
    model,
    baasMode,
    setBaasModel: baas.setModel,
    state,
    updatePageProperty,
    viewerId,
    guarantee: baas.guarantee,
    loading: baasMode ? baas.loading : false,
    loadError: baasMode ? baas.loadError : null,
    offline: baasMode ? baas.offline : false,
    totalNodes: baasMode ? baas.totalNodes : null,
    retry: baas.retry,
    expand: baas.expand,
  };
}
