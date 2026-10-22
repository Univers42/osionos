/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   graphSource.ts                                      +:      :+:    :+:   */
/*                                                    copyrightc        */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  licensed        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The source of a GRAPH diagram: the spec, compiled from the graph the bridge
 * gave this reader.
 *
 * The bridge's graph is ALREADY filtered by the reader's read rules, so this
 * file adds NO second source: the data it draws is the data the reader may
 * already read (devil C110). The page the spec names is the centre of the
 * neighbourhood; the neighbours are the pages linked to it.
 *
 * Two refusals come BEFORE the read:
 *
 *  - a published page reads nothing at all (devil C110) — no request, no
 *    graph, no diagram;
 *  - a reader with no session asks for nothing either: the offline app has
 *    no bridge to ask, and the block says so.
 *
 * This file is PURE: the read is INJECTED, so the refusals can be counted in
 * a test without a network.
 */

import type { BridgeGraph } from "@/features/graph-studio/model/toIngestDoc";

import { compileGraph } from "./compile";
import type { DiagramSource } from "./diagramSource";
import { parseDiagramSpec, type GraphKind } from "./diagramSpec";
import { graphKinds, neighbourhood, pageGraph } from "./graphInput";
import { mayReadOtherPages } from "./publicPageSignal";
import { irToMermaid } from "./toMermaid";

/** What the block says when the reader is not signed in. */
export const SIGN_IN_MESSAGE = "Sign in to draw the links of this page";

/** What the block says when the page is not in the reader's graph. */
export const NOT_IN_GRAPH_MESSAGE = "This page is not in your graph";

/** What the block says when the bridge does not answer. */
export const GRAPH_UNAVAILABLE_MESSAGE = "The links of this page are not available.";

/** What the graph adapter needs from the outside. */
export interface GraphSourceDeps {
  /** True when this document is a published page (devil C110). */
  isPublic: boolean;
  /** The session bearer; null when there is none (the offline app). */
  jwt: string | null;
  /** The bridge's read: the graph of the workspace, already filtered. */
  fetchGraph: () => Promise<BridgeGraph | null>;
}

/** What the graph adapter drew. */
export interface GraphOutput {
  /** The source of the diagram (or why there is none). */
  source: DiagramSource;
  /** The kinds of edge the graph holds — the toggles of the editor. */
  kinds: GraphKind[];
}

/** A source with nothing in it: the block draws nothing and says nothing. */
const NOTHING: DiagramSource = { source: null, truncated: false, error: null, unsupported: false };

/**
 * The source of a graph diagram, compiled from the bridge's graph.
 *
 * The refusals come first, and they come BEFORE the read: a published page
 * asks for nothing, and a reader with no session asks for nothing.
 *
 * A page the graph does not hold gives ONE message, whether the page does not
 * exist or the reader may not read it: the two are the same thing
 * (devil C101).
 */
export async function graphSource(spec: unknown, deps: GraphSourceDeps): Promise<GraphOutput> {
  const parsed = parseDiagramSpec(spec);
  if (!parsed.ok) {
    return { source: { ...NOTHING, error: parsed.error }, kinds: [] };
  }
  if (parsed.spec.kind !== "graph") {
    return { source: { ...NOTHING, unsupported: true }, kinds: [] };
  }
  const graphSpec = parsed.spec;

  // A published page draws nothing and reads no other page (devil C110).
  if (!mayReadOtherPages(deps.isPublic)) {
    return { source: NOTHING, kinds: [] };
  }
  // No session: the offline app. Say so, and ask for nothing.
  if (!deps.jwt) {
    return { source: { ...NOTHING, error: SIGN_IN_MESSAGE }, kinds: [] };
  }

  let graph: BridgeGraph | null = null;
  try {
    graph = await deps.fetchGraph();
  } catch {
    return { source: { ...NOTHING, error: GRAPH_UNAVAILABLE_MESSAGE }, kinds: [] };
  }

  const pages = pageGraph(graph);
  const kinds = graphKinds(pages);
  const hood = neighbourhood(pages, graphSpec.pageId, graphSpec.depth, graphSpec.kinds);
  if (!hood.center) {
    // The page is not in the reader's graph: it does not exist, or the reader
    // may not read it. The two are the same thing (devil C101).
    return { source: { ...NOTHING, error: NOT_IN_GRAPH_MESSAGE }, kinds };
  }
  const ir = compileGraph(hood.center, hood.neighbors);
  return {
    source: {
      source: irToMermaid(ir, { direction: graphSpec.direction }),
      truncated: ir.truncated || hood.truncated,
      // The cap is named: the reader knows the diagram holds fewer links than
      // the graph does, and how many fewer.
      truncatedNote: hood.truncated
        ? `Showing ${hood.neighbors.length} of ${hood.neighbors.length + hood.dropped} neighbours`
        : undefined,
      error: null,
      unsupported: false,
    },
    kinds,
  };
}
