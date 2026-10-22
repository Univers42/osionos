/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   compile.ts                                          +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The four PURE compilers: data in, an IR out.
 *
 * Nothing here reads a store, a network or a clock. The inputs are the
 * MINIMAL interfaces below, so the block slice adapts the stores to them and
 * the compiler stays testable: the same data gives the same IR, byte for byte,
 * on every machine.
 *
 * The order is deterministic everywhere (the text first, then the id), so the
 * same set of pages always draws the same diagram in the same place.
 */

import {
  compareByText,
  createDiagramIR,
  type DiagramEdge,
  type DiagramIR,
  type DiagramNode,
} from "./diagramIR";

/** One property of a database. A relation names the database it points at. */
export interface SchemaProperty {
  id: string;
  name: string;
  type: string;
  relationTo?: string | string[];
}

/** One database of the schema diagram. */
export interface SchemaDatabase {
  id: string;
  name: string;
  properties: SchemaProperty[];
}

/** The page at the centre of a neighbourhood. */
export interface GraphCenter {
  id: string;
  title: string;
}

/** One neighbour of the centre. `via` is the page it was reached through. */
export interface GraphNeighbor {
  pageId: string;
  title: string;
  kind: string;
  depth: number;
  via?: string;
}

/** The root of a hierarchy. */
export interface HierarchyRoot {
  id: string;
  title: string;
}

/** One child of a hierarchy: its parent is named by id, so the tree is flat. */
export interface HierarchyChild {
  id: string;
  parentId: string;
  title: string;
}

/** One status of a pipeline: the value of the status property. */
export interface StatusOption {
  id: string;
  name: string;
}

/** One row of a pipeline. */
export interface PipelineRow {
  id: string;
  title: string;
  statusId: string;
}

/** The group the rows with an unknown status fall into. */
export const NO_STATUS_GROUP_ID = "no-status";

/**
 * The schema of a set of databases: one node per database (its properties
 * listed in the label) and one edge per relation property whose target is
 * among the databases of the set.
 */
export function compileSchema(databases: SchemaDatabase[]): DiagramIR {
  const sorted = [...databases].sort((a, b) => compareByText(a.name, a.id, b.name, b.id));
  const ids = new Set(sorted.map((database) => database.id));
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  for (const database of sorted) {
    const properties = [...database.properties].sort((a, b) =>
      compareByText(a.name, a.id, b.name, b.id),
    );
    const listed = properties.map((property) => `${property.name} (${property.type})`).join(", ");
    nodes.push({ id: database.id, label: listed ? `${database.name}: ${listed}` : database.name });
    for (const property of properties) {
      const targets =
        property.relationTo === undefined
          ? []
          : Array.isArray(property.relationTo)
            ? property.relationTo
            : [property.relationTo];
      for (const target of targets) {
        if (!ids.has(target)) continue;
        edges.push({ from: database.id, to: target, label: property.name, kind: "relation" });
      }
    }
  }
  return createDiagramIR({ nodes, edges, groups: [] });
}

/**
 * The neighbourhood of a page: the centre, its neighbours, and one edge per
 * neighbour. The edge says WHY (the kind of relation) and, for a neighbour
 * reached at depth two, THROUGH WHICH page.
 */
export function compileGraph(center: GraphCenter, neighbors: GraphNeighbor[]): DiagramIR {
  const sorted = [...neighbors].sort((a, b) => compareByText(a.title, a.pageId, b.title, b.pageId));
  const nodes: DiagramNode[] = [{ id: center.id, label: center.title }];
  const edges: DiagramEdge[] = [];
  for (const neighbor of sorted) {
    nodes.push({ id: neighbor.pageId, label: neighbor.title });
    const label = neighbor.via ? `${neighbor.kind} via ${neighbor.via}` : neighbor.kind;
    edges.push({ from: center.id, to: neighbor.pageId, label, kind: neighbor.kind });
  }
  return createDiagramIR({ nodes, edges, groups: [] });
}

/**
 * The tree under a page: the root, its descendants up to `depth` levels, and
 * one edge per parent. The children arrive flat; the tree is walked level by
 * level, and every level is sorted, so the same tree always draws the same way.
 */
export function compileHierarchy(
  root: HierarchyRoot,
  children: HierarchyChild[],
  depth: number,
): DiagramIR {
  const nodes: DiagramNode[] = [{ id: root.id, label: root.title }];
  const edges: DiagramEdge[] = [];
  const seen = new Set([root.id]);
  let frontier = [root.id];
  for (let level = 0; level < depth; level += 1) {
    const next: string[] = [];
    for (const parentId of frontier) {
      const levelChildren = children
        .filter((child) => child.parentId === parentId)
        .sort((a, b) => compareByText(a.title, a.id, b.title, b.id));
      for (const child of levelChildren) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        nodes.push({ id: child.id, label: child.title });
        edges.push({ from: parentId, to: child.id });
        next.push(child.id);
      }
    }
    frontier = next;
  }
  return createDiagramIR({ nodes, edges, groups: [] });
}

/**
 * The pipeline of a database: one group per status, the rows of a status
 * inside it, and the rows whose status is not one of the options in a "No
 * status" group — a row never disappears because its status was renamed.
 */
export function compilePipeline(statusOptions: StatusOption[], rows: PipelineRow[]): DiagramIR {
  const statuses = [...statusOptions].sort((a, b) => compareByText(a.name, a.id, b.name, b.id));
  const groups = statuses.map((status) => ({ id: status.id, label: status.name }));
  const known = new Set(statuses.map((status) => status.id));
  const sorted = [...rows].sort((a, b) => compareByText(a.title, a.id, b.title, b.id));
  const nodes: DiagramNode[] = [];
  let orphans = false;
  for (const row of sorted) {
    const group = known.has(row.statusId) ? row.statusId : NO_STATUS_GROUP_ID;
    if (group === NO_STATUS_GROUP_ID) orphans = true;
    nodes.push({ id: row.id, label: row.title, group });
  }
  if (orphans) groups.push({ id: NO_STATUS_GROUP_ID, label: "No status" });
  return createDiagramIR({ nodes, edges: [], groups });
}
