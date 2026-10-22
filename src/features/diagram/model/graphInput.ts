/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   graphInput.ts                                       +:      :+:    :+:   */
/*                                                    copyrightc        */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  licensed        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The neighbourhood of a page: the links around it, read from the graph the
 * bridge already filtered (devil C100, C101).
 *
 * The bridge's graph is ALREADY the reader's graph: it holds the pages the
 * reader may read, and the edges between them, and nothing else. So this file
 * adds NO source of its own — it walks the graph it is given, once, over an
 * adjacency map built in one pass (O(V+E)).
 *
 * Two rules hold the line:
 *
 *  - the walk never goes THROUGH a node the graph does not hold (C100). An
 *    edge whose end is missing is dropped, so the page beyond it is never
 *    reached: the readable subgraph is cut BEFORE the walk, never after it.
 *  - a page the reader may not read and a page that does not exist are the
 *    SAME thing (C101): both are absent from the graph, and both give the one
 *    error string.
 *
 * The neighbours of a page are the pages linked to it in EITHER direction: a
 * page that mentions me is as much a neighbour of mine as one I mention.
 *
 * This file is PURE: it reads no store, no network and no clock.
 */

import { pageIdOf, type BridgeGraph, type BridgeNode } from "@/features/graph-studio/model/toIngestDoc";

import type { GraphCenter, GraphNeighbor } from "./compile";
import { compareByText } from "./diagramIR";
import { GRAPH_KINDS, type GraphKind } from "./diagramSpec";

/** The most neighbours a neighbourhood holds: the rest are counted, not drawn. */
export const MAX_NEIGHBORS = 40;

/** One page of the graph: the id, and the title its box carries. */
export interface GraphPage {
  /** The page id (a uuid, or the id of a page that is not synced yet). */
  id: string;
  /** The title the box carries. */
  title: string;
}

/** One edge of the graph: from one page to another, of one kind. */
export interface GraphEdge {
  /** The page the edge starts at. */
  from: string;
  /** The page the edge ends at. */
  to: string;
  /** The kind of the edge. */
  kind: GraphKind;
}

/** The graph the neighbourhood walks: pages, and the links between them. */
export interface PageGraph {
  /** The pages of the graph. */
  pages: GraphPage[];
  /** The links between them. */
  edges: GraphEdge[];
}

/**
 * The bridge's edge type of each kind of the spec.
 *
 * The bridge names its edges `link` (the inline `[[page:]]` mention), `parent`
 * (the hierarchy), `relation` (a relation property) and `tagged` (a tag). The
 * spec names the kinds the editor offers, so the two are mapped here — in ONE
 * place, so a kind never means two things.
 */
const BRIDGE_TYPES: Record<GraphKind, readonly string[]> = {
  link: ["link"],
  mention: ["mention"],
  relation: ["relation"],
  parent: ["parent"],
  tag: ["tagged", "tag"],
  semantic: ["semantic"],
};

/** The kind of each bridge edge type. */
const KIND_OF_TYPE: ReadonlyMap<string, GraphKind> = new Map(
  GRAPH_KINDS.flatMap((kind) => BRIDGE_TYPES[kind].map((type) => [type, kind] as const)),
);

/** The title of a bridge node: its title, its name, its key, its id. */
function titleOf(node: BridgeNode): string {
  const data = node.data ?? {};
  const title = data.title;
  if (typeof title === "string" && title !== "") return title;
  const name = data.name;
  if (typeof name === "string" && name !== "") return name;
  return node.pk ?? node.id;
}

/**
 * The bridge's graph, as the pages and the links between them.
 *
 * A node that is not a PAGE (a tag, a record) is not a neighbour: the
 * neighbourhood of a page is made of pages. An edge whose ends are not both
 * pages is dropped — and that is exactly what keeps the walk from going
 * THROUGH a node the graph does not hold (C100).
 */
export function pageGraph(graph: BridgeGraph | null | undefined): PageGraph {
  const pages: GraphPage[] = [];
  const byNodeId = new Map<string, string>();
  for (const node of graph?.nodes ?? []) {
    if (!node) continue;
    const pageId = pageIdOf(node.id);
    if (!pageId) continue;
    if (byNodeId.has(node.id)) continue;
    byNodeId.set(node.id, pageId);
    pages.push({ id: pageId, title: titleOf(node) });
  }
  const edges: GraphEdge[] = [];
  for (const edge of graph?.edges ?? []) {
    if (!edge) continue;
    const kind = KIND_OF_TYPE.get((edge.type ?? "").toLowerCase());
    if (!kind) continue;
    const from = byNodeId.get(edge.from);
    const to = byNodeId.get(edge.to);
    if (!from || !to || from === to) continue;
    edges.push({ from, to, kind });
  }
  return { pages, edges };
}

/**
 * The kinds of edge the graph holds, among the ones that link two pages.
 *
 * The order is the order of the closed spec, so the toggles of the editor
 * never move around.
 */
export function graphKinds(graph: PageGraph): GraphKind[] {
  const present = new Set<GraphKind>();
  for (const edge of graph.edges) present.add(edge.kind);
  return GRAPH_KINDS.filter((kind) => present.has(kind));
}

/** The neighbourhood of a page: the centre, its neighbours, and what the cap dropped. */
export interface Neighbourhood {
  /** The centre: null when the page is not in the graph. */
  center: GraphCenter | null;
  /** The neighbours, at most MAX_NEIGHBORS of them. */
  neighbors: GraphNeighbor[];
  /** True when the cap dropped neighbours: the diagram holds less than the data. */
  truncated: boolean;
  /** How many neighbours the cap dropped. */
  dropped: number;
}

/** One link of the adjacency map: the page it reaches, and the kind it is. */
interface Link {
  id: string;
  kind: GraphKind;
}

/**
 * The adjacency map of the graph: ONE pass over the edges, both ways.
 *
 * The map holds only the edges of the wanted kinds, and only between two
 * pages of the graph — the walk can never step on a node the graph does not
 * hold, because such a node is not in the map at all.
 */
function adjacencyOf(graph: PageGraph, wanted: Set<GraphKind> | null): Map<string, Link[]> {
  const adjacency = new Map<string, Link[]>();
  const add = (from: string, link: Link) => {
    const list = adjacency.get(from);
    if (list) list.push(link);
    else adjacency.set(from, [link]);
  };
  for (const edge of graph.edges) {
    if (wanted && !wanted.has(edge.kind)) continue;
    add(edge.from, { id: edge.to, kind: edge.kind });
    add(edge.to, { id: edge.from, kind: edge.kind });
  }
  return adjacency;
}

/**
 * The neighbourhood of a page: the centre, its neighbours, and the way each
 * of them was reached.
 *
 * The walk is level by level: the neighbours of the centre first, then the
 * neighbours of THOSE — a page reached at depth two says THROUGH WHICH page
 * it was reached (`via`, the title of that page).
 *
 * The order is STABLE (the title first, then the id), so the same graph always
 * draws the same diagram, and the cap always drops the same ones.
 *
 * A centre the graph does not hold gives an EMPTY neighbourhood: the page
 * does not exist, or the reader may not read it — and the two are the same
 * thing (devil C101).
 */
export function neighbourhood(
  graph: PageGraph,
  centerId: string,
  depth: 1 | 2,
  kinds?: readonly GraphKind[],
): Neighbourhood {
  const titles = new Map<string, string>();
  for (const page of graph.pages) {
    if (!titles.has(page.id)) titles.set(page.id, page.title);
  }
  const centerTitle = titles.get(centerId);
  if (centerTitle === undefined) {
    return { center: null, neighbors: [], truncated: false, dropped: 0 };
  }

  // No filter, or an empty one: every kind is walked.
  const wanted = kinds && kinds.length > 0 ? new Set(kinds) : null;
  const adjacency = adjacencyOf(graph, wanted);

  const center: GraphCenter = { id: centerId, title: centerTitle };
  const seen = new Set<string>([centerId]);
  const neighbors: GraphNeighbor[] = [];
  let frontier = [centerId];
  let dropped = 0;

  for (let level = 1; level <= depth; level += 1) {
    const found: Array<{ id: string; kind: GraphKind; via?: string }> = [];
    for (const from of frontier) {
      for (const link of adjacency.get(from) ?? []) {
        if (seen.has(link.id)) continue;
        found.push({
          id: link.id,
          kind: link.kind,
          via: level > 1 ? (titles.get(from) ?? "") : undefined,
        });
      }
    }
    found.sort((left, right) =>
      compareByText(titles.get(left.id) ?? "", left.id, titles.get(right.id) ?? "", right.id),
    );
    const next: string[] = [];
    for (const entry of found) {
      seen.add(entry.id);
      if (neighbors.length >= MAX_NEIGHBORS) {
        dropped += 1;
        continue;
      }
      neighbors.push({
        pageId: entry.id,
        title: titles.get(entry.id) ?? "",
        kind: entry.kind,
        depth: level,
        ...(entry.via ? { via: entry.via } : {}),
      });
      next.push(entry.id);
    }
    // The cap is the cap: the walk stops there, and the pages it did not reach
    // are the ones the diagram does not show.
    if (neighbors.length >= MAX_NEIGHBORS) break;
    frontier = next;
  }

  return { center, neighbors, truncated: dropped > 0, dropped };
}
