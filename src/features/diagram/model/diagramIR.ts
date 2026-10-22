/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   diagramIR.ts                                        +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The diagram IR: what a diagram IS, before it is text.
 *
 * The compilers (compile.ts) turn data into an IR; the emitter (toMermaid.ts)
 * turns an IR into mermaid. Between them sits the CAP: a shared page can hold
 * ten thousand pages, and a diagram that holds ten thousand nodes is a denial
 * of service in a picture. The IR keeps the FIRST nodes of the stable order and
 * says `truncated: true` — the renderer shows "showing 150 of N".
 */

/** The most nodes a diagram may hold. */
export const MAX_NODES = 150;

/** The most edges a diagram may hold. */
export const MAX_EDGES = 400;

/** One box of the diagram. The id is the DATA id (a uuid); the emitter renames it. */
export interface DiagramNode {
  id: string;
  label: string;
  /** The id of the group this node belongs to, when it belongs to one. */
  group?: string;
}

/** One arrow of the diagram. */
export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  kind?: string;
}

/** One box around nodes: a pipeline column, a cluster. */
export interface DiagramGroup {
  id: string;
  label: string;
}

/** The diagram, as the emitter sees it. */
export interface DiagramIR {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  /** True when the caps dropped something: the diagram shows less than the data. */
  truncated: boolean;
}

/** What the compilers hand to the IR builder. */
export interface DiagramIRInput {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
}

/**
 * Build the IR and apply the caps.
 *
 * The order the compilers produced is STABLE (the text first, then the id), so
 * the first 150 nodes are always the same 150 for the same data. An edge whose
 * end was dropped is dropped too: mermaid would draw a node that does not
 * exist. A group whose nodes were all dropped goes with them.
 */
export function createDiagramIR(input: DiagramIRInput): DiagramIR {
  const nodes = input.nodes.slice(0, MAX_NODES);
  const kept = new Set(nodes.map((node) => node.id));
  const edges = input.edges
    .filter((edge) => kept.has(edge.from) && kept.has(edge.to))
    .slice(0, MAX_EDGES);
  const groups = input.groups.filter((group) =>
    nodes.some((node) => node.group === group.id),
  );
  const truncated =
    nodes.length < input.nodes.length || edges.length < input.edges.length;
  return { nodes, edges, groups, truncated };
}

/**
 * The ONE order every compiler uses: the text first, then the id.
 *
 * Never `localeCompare`: its result depends on the ICU of the machine, and two
 * browsers must draw the same diagram. A code-unit comparison is the same
 * everywhere.
 */
export function compareByText(
  left: string,
  leftId: string,
  right: string,
  rightId: string,
): number {
  if (left < right) return -1;
  if (left > right) return 1;
  if (leftId < rightId) return -1;
  if (leftId > rightId) return 1;
  return 0;
}
