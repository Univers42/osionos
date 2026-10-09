import { api, getActivePageJwt } from "@/shared/api/client";

import type { BridgeGraph } from "../model/toIngestDoc";

/**
 * What the graph shows: the active workspace's pages, every workspace's pages, or pages
 * plus the records of every database the user's workspaces link to. The values and the
 * storage key are the ones the legacy graph persisted, so a saved choice carries over.
 */
export type GraphScope = "workspace" | "all" | "all-data";

export const GRAPH_SCOPES: readonly GraphScope[] = ["workspace", "all", "all-data"];
const GRAPH_SCOPE_KEY = "osionos:graph-scope";

export function loadGraphScope(): GraphScope {
  try {
    const stored = localStorage.getItem(GRAPH_SCOPE_KEY) as GraphScope | null;
    return stored && GRAPH_SCOPES.includes(stored) ? stored : "all-data";
  } catch {
    return "all-data";
  }
}

export function saveGraphScope(scope: GraphScope): void {
  try {
    localStorage.setItem(GRAPH_SCOPE_KEY, scope);
  } catch {
    // Storage blocked: the choice lasts for this view only.
  }
}

/** The bridge route for a scope. The bridge filters by the session's owner and workspaces. */
export function bridgeGraphPath(scope: GraphScope, workspaceId: string): string {
  if (scope === "all-data") return "/api/graph/data?scope=account";
  if (scope === "all") return "/api/graph/pages?scope=all";
  return workspaceId ? `/api/graph/pages?workspaceId=${encodeURIComponent(workspaceId)}` : "/api/graph/pages";
}

/**
 * The graph the bridge gives this session, or null when there is no bridge session.
 * The bridge is the only data path for the graph, never the BaaS query plane.
 */
export async function fetchBridgeGraph(scope: GraphScope, workspaceId: string): Promise<BridgeGraph | null> {
  const jwt = getActivePageJwt();
  if (!jwt) return null;
  return (await api.get<BridgeGraph>(bridgeGraphPath(scope, workspaceId), jwt)) ?? { nodes: [], edges: [] };
}
