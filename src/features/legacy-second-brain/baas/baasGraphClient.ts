/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   baasGraphClient.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { baasConfigured, baasPost } from "./baasFetch";
import type {
  BaasGenerators,
  BaasGraphResponse,
  BaasNodeId,
  BaasResource,
} from "./types";

/**
 * Read client for the live BaaS `/query/v1/graph` (focus + depth BFS) and
 * `/graph/overview` (bounded whole-vault) endpoints (baas-graph-endpoint.md).
 * Transport/auth is shared via `baasFetch`; this module only owns the graph
 * request shapes and env config. When unset, the graph runs from local state.
 */

const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
const EDGES_DB_ID = (env.VITE_BAAS_EDGES_DB_ID ?? "").trim();
const EDGES_TABLE = (env.VITE_BAAS_EDGES_TABLE ?? "edges").trim();
const OVERLAY_TABLE = (env.VITE_BAAS_OVERLAY_TABLE ?? "og_overlays").trim();
const NOTES_TABLE = (env.VITE_BAAS_NOTES_TABLE ?? "og_notes").trim();

/** Whether the live BaaS graph source is configured (else: local-only). */
export function isBaasGraphEnabled(): boolean {
  return baasConfigured() && Boolean(EDGES_DB_ID);
}

/** The mount + table names backing edges and note overlays (same mount). */
export const edgesMount = (): string => EDGES_DB_ID;
export const edgesTable = (): string => EDGES_TABLE;
export const overlayTable = (): string => OVERLAY_TABLE;
/** Resource (collection) holding osionos notes, rendered as note-colored nodes. */
export const notesTable = (): string => NOTES_TABLE;

/** The mount that holds the notes collection (derived from the graph resources). */
export const notesMount = (): string =>
  configuredResources().find((resource) => resource.table === NOTES_TABLE)?.dbId ?? "";

/** Resources to sample for the overview, from `VITE_BAAS_GRAPH_RESOURCES` (JSON). */
export function configuredResources(): BaasResource[] {
  return parseJson<BaasResource[]>(env.VITE_BAAS_GRAPH_RESOURCES) ?? [];
}

/** Optional server-side generators, from `VITE_BAAS_GRAPH_GENERATORS` (JSON). */
export function configuredGenerators(): BaasGenerators | undefined {
  return parseJson<BaasGenerators>(env.VITE_BAAS_GRAPH_GENERATORS) ?? undefined;
}

/** Bounded whole-vault view: samples up to `limit` rows per resource. */
export async function fetchGraphOverview(
  resources: BaasResource[] = configuredResources(),
  limit = 400,
): Promise<BaasGraphResponse> {
  return baasPost<BaasGraphResponse>("/query/v1/graph/overview", {
    resources,
    edgesDbId: EDGES_DB_ID,
    edgesTable: EDGES_TABLE,
    limit,
    generators: configuredGenerators(),
  });
}

/** Neighborhood of a focus node (expand-on-demand). */
export async function fetchGraphFocus(focus: BaasNodeId, depth = 1): Promise<BaasGraphResponse> {
  return baasPost<BaasGraphResponse>("/query/v1/graph", {
    focus,
    depth,
    edgesDbId: EDGES_DB_ID,
    edgesTable: EDGES_TABLE,
    generators: configuredGenerators(),
  });
}

function parseJson<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
