/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Wire types for the BaaS `/query/v1/graph` contract — a faithful mirror of
 * `docs/second-brain/baas-graph-endpoint.md` (canonical: apps/grobase/wiki/integrations/graph-contract.md).
 * The wire uses `from`/`to`; `mapGraphResponse` is the boundary that maps them to
 * our internal `source`/`target`. Keep these in sync with the canonical contract.
 */

/** `<mount>:<resource>:<pk>`. */
export type BaasNodeId = string;

export interface BaasGraphNode {
  id: BaasNodeId;
  mount: string;
  resource: string;
  pk: string;
  data: Record<string, unknown>;
  note?: string;
}

export interface BaasEdgeRecord {
  id: string;
  from: BaasNodeId;
  to: BaasNodeId;
  type: string;
  label?: string;
  directed?: boolean;
}

/** Honest consistency tier (doc 02). Never implies a global atomic snapshot. */
export type GraphGuarantee = "per_node_atomic" | "subgraph_eventual";

export interface BaasGraphResponse {
  focus?: BaasNodeId;
  depth: number;
  nodes: BaasGraphNode[];
  edges: BaasEdgeRecord[];
  guarantee: GraphGuarantee;
}

/** A (mount, table) pair sampled by the `/graph/overview` endpoint. */
export interface BaasResource {
  dbId: string;
  table: string;
}

/** Optional server-side edge generators (graph contract §3.1). */
export interface BaasGenerators {
  noteField?: string;
  tags?: { field: string; mount: string; resource: string };
  references?: { field: string; mount: string; resource: string }[];
}
