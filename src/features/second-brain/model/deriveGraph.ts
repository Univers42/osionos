/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   deriveGraph.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { DatabaseSchema, NotionState, Page } from "@notion-db/contract-types";
import {
  type GraphEdge,
  type GraphModel,
  type GraphNode,
  type NodeId,
  indexModel,
  makeRecordNodeId,
} from "./graphModel";
import { type ExplicitEdgeRecord, explicitEdges } from "./edges/explicitEdges";
import { relationEdges } from "./edges/relationEdges";
import { type TagConfig, tagEdges } from "./edges/tagEdges";
import { applyDegreeWeights } from "./weights";
import { textValue, versionFromTimestamp } from "./value";

/**
 * The single pure projection: canonical `NotionState` → typed `GraphModel`.
 * Deterministic and O(N + E); no I/O, no React, no positions. Consumed by the
 * layout worker and renderer via `GraphModel`/`GraphPatch`, never raw state.
 */

export interface DeriveOptions {
  /** Backend that owns the rows (used as the `<mount>` id segment). */
  source: string;
  /** Include archived pages as nodes (default false). */
  includeArchived?: boolean;
  /** Explicit `edges`-mount rows — the PRIMARY edge source (doc 02 §0). */
  explicitEdges?: readonly ExplicitEdgeRecord[];
  /** Tag-synthesis config for schemaless backends (doc 03). */
  tagConfig?: TagConfig;
}

export function deriveGraph(state: NotionState, options: DeriveOptions): GraphModel {
  const { source, includeArchived = false } = options;

  const recordNodes = collectRecordNodes(state, source, includeArchived);
  const nodeIds = new Set<NodeId>(recordNodes.map((node) => node.id));

  const tags = tagEdges(state, source, nodeIds, options.tagConfig);
  for (const hub of tags.nodes) nodeIds.add(hub.id);

  const edges: GraphEdge[] = [
    ...explicitEdges(options.explicitEdges ?? [], nodeIds),
    ...relationEdges(state, source, nodeIds),
    ...tags.edges,
  ];

  const nodes = [...recordNodes, ...tags.nodes];
  applyDegreeWeights(nodes, edges);
  return indexModel(nodes, edges);
}

function collectRecordNodes(state: NotionState, source: string, includeArchived: boolean): GraphNode[] {
  const nodes: GraphNode[] = [];
  for (const page of Object.values(state.pages)) {
    if (page.archived && !includeArchived) continue;
    const database = state.databases[page.databaseId];
    if (!database) continue;
    nodes.push(createRecordNode(page, database, source));
  }
  return nodes;
}

function createRecordNode(page: Page, database: DatabaseSchema, source: string): GraphNode {
  return {
    id: makeRecordNodeId(source, page.databaseId, page.id),
    kind: "record",
    databaseId: page.databaseId,
    source,
    label: textValue(page.properties[database.titlePropertyId]) || "Untitled",
    group: groupValue(database, page) || database.name || null,
    weight: 0,
    version: versionFromTimestamp(page.updatedAt),
    hasNote: false,
    icon: page.icon || undefined,
  };
}

/** Pick a "group" label from a status property, falling back to a select. */
function groupValue(database: DatabaseSchema, page: Page): string {
  const properties = Object.values(database.properties);
  const grouping =
    properties.find((property) => property.type === "status") ??
    properties.find((property) => property.type === "select");
  return grouping ? textValue(page.properties[grouping.id]) : "";
}
