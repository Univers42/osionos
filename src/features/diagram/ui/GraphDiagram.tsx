/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   GraphDiagram.tsx                                    +:      :+:    :+:   */
/*                                                    copyrightc        */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  licensed        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The `graph` kind: the links around a page, drawn from the graph the bridge
 * gave this reader.
 *
 * This module is the ONLY one of the feature that reads the bridge, so it is
 * loaded LAZILY: a hand-written mermaid diagram, a page tree and the two
 * database kinds never pay for this chunk (the block reaches it through a
 * dynamic import, and only for the graph kind).
 *
 * The data is the bridge's graph, ALREADY filtered by the reader's read
 * rules: the block adds no second source of its own (devil C110). A published
 * page reads nothing at all, and a reader with no session asks for nothing —
 * both are refusals, not empty diagrams.
 *
 * A diagram is never stored: the spec names a page, and the neighbourhood is
 * compiled again, from the graph of the moment.
 */

import React, { useEffect, useState } from "react";

import { useUserStore } from "@/features/auth/model/useUserStore";
import { fetchBridgeGraph } from "@/features/graph-studio/api/fetchBridgeGraph";
import { getActivePageJwt } from "@/shared/api/client";

import type { GraphKind } from "../model/diagramSpec";
import { graphSource, type GraphOutput } from "../model/graphSource";
import { DiagramOutput } from "./DiagramOutput";
import { isPublicPage } from "../model/publicPageSignal";

interface GraphDiagramProps {
  /** The stored spec: a graph. */
  spec: unknown;
  /** Report the compiled mermaid, for the export of the block. */
  onSource?: (source: string | null) => void;
  /** Report the kinds of edge the graph holds, for the toggles of the editor. */
  onKinds?: (kinds: GraphKind[]) => void;
}

/**
 * The neighbourhood of a page, drawn from the graph of the moment.
 *
 * The source is computed from the spec and the reader's own graph: a renamed
 * page redraws, and a page the reader may not read is not drawn — it is not
 * even in the graph the bridge gave.
 */
export const GraphDiagram: React.FC<GraphDiagramProps> = ({ spec, onSource, onKinds }) => {
  const isPublic = isPublicPage();
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? "");
  // The identity of a draw: the spec, the workspace and the page. A draw
  // that answers for another one is not the answer to this one, so it is
  // held aside — the block shows that it is still drawing.
  const key = `${workspaceId}|${isPublic ? "public" : "app"}|${JSON.stringify(spec ?? null)}`;
  const [state, setState] = useState<{ key: string; output: GraphOutput } | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    void graphSource(spec, {
      isPublic,
      jwt: getActivePageJwt(),
      fetchGraph: () => fetchBridgeGraph("workspace", workspaceId),
    }).then((result) => {
      if (!alive) return;
      setState({ key, output: result });
      onSource?.(result.source.source);
      onKinds?.(result.kinds);
    });
    return () => {
      alive = false;
    };
  }, [spec, key, isPublic, workspaceId, onSource, onKinds]);

  if (!workspaceId) {
    return <p className="px-3 py-2 text-sm text-[var(--osio-fg-subtle)]">The links of this page are not available.</p>;
  }
  const output = state?.key === key ? state.output : null;
  if (!output) {
    return <p className="px-3 py-2 text-sm text-[var(--osio-fg-subtle)]">Drawing the links…</p>;
  }
  return <DiagramOutput {...output.source} />;
};
