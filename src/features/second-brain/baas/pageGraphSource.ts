/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageGraphSource.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The graph's NOTE layer now reads the CANONICAL page record (osionos_pages) through the
 * bridge's owner-scoped `GET /api/graph/pages`, replacing the duplicate Mongo `og_notes`
 * mirror. The whole-vault overview is then the canonical pages STITCHED with the
 * engine-agnostic data layer (`/query/v1/graph/overview` over og_nodes/og_people, …) —
 * "both engines, one graph". Owner-scoping for notes is authoritative server-side here,
 * so the client no longer needs the `liveNoteIds` filter.
 */

import { api, getActivePageJwt } from "@/shared/api/client";
import { configuredResources, fetchGraphOverview } from "./baasGraphClient";
import type { BaasGraphResponse } from "./types";

/** The resource name the bridge tags page nodes with → rendered as the note layer. */
export const PAGE_GRAPH_RESOURCE = "osionos_pages";

/**
 * Graph scope: the active workspace only (default), every workspace the user owns
 * (notes), or the whole multi-engine ecosystem — notes ⊕ records from every database
 * the user's workspaces are linked to (`all-data`, composed by the bridge).
 */
export type GraphScope = "workspace" | "all" | "all-data";

const EMPTY: BaasGraphResponse = { depth: 0, nodes: [], edges: [], guarantee: "subgraph_eventual" };

/**
 * Pull the viewer's page graph (note layer) from the bridge's canonical
 * osionos_pages, scoped to the active workspace by default (or all the user's
 * workspaces when scope === "all"). Owner-filtering is authoritative server-side.
 */
export async function fetchPageGraphOverview(
  workspaceId?: string | null,
  scope: GraphScope = "workspace",
): Promise<BaasGraphResponse> {
  const jwt = getActivePageJwt();
  if (!jwt) return EMPTY; // no bridge session → no notes (data layer still loads)
  const params = new URLSearchParams();
  if (scope === "all") params.set("scope", "all");
  else if (workspaceId) params.set("workspaceId", workspaceId);
  const qs = params.toString();
  const response = await api.get<BaasGraphResponse>(`/api/graph/pages${qs ? `?${qs}` : ""}`, jwt);
  return response ?? EMPTY;
}

/**
 * The whole multi-engine ecosystem the viewer can access: note nodes ⊕ records from
 * every database their workspaces are linked to, composed AND access-filtered by the
 * bridge (`GET /api/graph/data`, scope=account = all workspaces the session belongs to).
 * The bridge already merges notes with records, so this is the complete graph.
 */
async function fetchDataGraphOverview(): Promise<BaasGraphResponse> {
  const jwt = getActivePageJwt();
  if (!jwt) return EMPTY; // no bridge session → no records (engine-agnostic data is bridge-only)
  const response = await api.get<BaasGraphResponse>("/api/graph/data?scope=account", jwt);
  return response ?? EMPTY;
}

/** Merge two graph responses, deduping by id; the honest guarantee is the weaker tier. */
function mergeResponses(pages: BaasGraphResponse, data: BaasGraphResponse): BaasGraphResponse {
  const nodes = new Map(pages.nodes.map((node) => [node.id, node] as const));
  for (const node of data.nodes) if (!nodes.has(node.id)) nodes.set(node.id, node);
  const edges = new Map(pages.edges.map((edge) => [edge.id, edge] as const));
  for (const edge of data.edges) if (!edges.has(edge.id)) edges.set(edge.id, edge);
  const guarantee = pages.guarantee === "per_node_atomic" && data.guarantee === "per_node_atomic"
    ? "per_node_atomic"
    : "subgraph_eventual";
  return { depth: 0, nodes: [...nodes.values()], edges: [...edges.values()], guarantee };
}

/**
 * Whole-vault overview = canonical pages (bridge) ⊕ the cross-engine data layer
 * (/query/v1). Pages are the source of truth, so a data-layer failure is non-fatal (it
 * yields an empty data set); a bridge failure propagates so the view's retry/offline
 * snapshot logic engages.
 */
export async function fetchCombinedOverview(
  workspaceId?: string | null,
  scope: GraphScope = "workspace",
): Promise<BaasGraphResponse> {
  // `all-data` is composed end-to-end by the bridge (notes ⊕ multi-engine records,
  // access-filtered) — no client-side data layer needed.
  if (scope === "all-data") return fetchDataGraphOverview();
  // Exclude the legacy `og_notes` mirror (now superseded by the bridge page graph) and any
  // osionos_pages resource, so the data layer never duplicates the canonical note nodes.
  const dataResources = configuredResources().filter(
    (resource) => resource.table !== "og_notes" && resource.table !== PAGE_GRAPH_RESOURCE,
  );
  const [pages, data] = await Promise.all([
    fetchPageGraphOverview(workspaceId, scope),
    fetchGraphOverview(dataResources).catch(() => EMPTY),
  ]);
  return mergeResponses(pages, data);
}
