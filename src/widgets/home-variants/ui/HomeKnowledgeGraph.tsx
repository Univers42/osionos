/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   HomeKnowledgeGraph.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useMemo } from "react";
import { LocateFixed, ZoomIn, ZoomOut } from "lucide-react";

import { useUserStore } from "@/features/auth";
import { derivePageState, savePagesCache } from "@/store/pageStore.helpers";
import { usePageStore } from "@/store/usePageStore";
import { useKnownDatabaseStateStore } from "@/widgets/database-view/model/knownDatabaseState";
import { createHomeKnowledgeGraph, type HomeGraphNode, type HomeGraphProperty } from "../model/homeKnowledgeGraphData";
import { toPageTreeInput, type PageTreeInput } from "../model/homePageTreeGraph";
import { KIND_LABELS, NODE_COLORS, VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from "./homeGraphModel";
import { relatedNodeIdsFor, selectedLinksFor } from "./homeGraphSelection";
import { GraphLinks, GraphNodes, GraphPropertyEditor, Metric } from "./homeGraphParts";
import { createSecondBrainPage, upsertPage } from "./homeSecondBrainPage";
import { useGraphSimulation } from "./useGraphSimulation";
import "./homeKnowledgeGraph.css";

export const HomeKnowledgeGraph: React.FC = () => {
  const knownDatabaseState = useKnownDatabaseStateStore((state) => state.state);
  const updatePageProperty = useKnownDatabaseStateStore((state) => state.updatePageProperty);
  const activeUserId = useUserStore((state) => state.activeUserId);
  const session = useUserStore((state) => state.activeSession());
  const activeWorkspace = useUserStore((state) => state.activeWorkspace());
  const workspaceId = activeWorkspace?._id ?? session?.privateWorkspaces[0]?._id ?? "";
  const ownerId = activeUserId || session?.userId || null;
  const openPage = usePageStore((state) => state.openPage);
  const wsPages = usePageStore((state) => state.pages[workspaceId]);
  const pageTree = useMemo<PageTreeInput[]>(() => toPageTreeInput(wsPages), [wsPages]);
  const graph = useMemo(() => createHomeKnowledgeGraph(knownDatabaseState, pageTree), [knownDatabaseState, pageTree]);

  const sim = useGraphSimulation(graph);
  const { nodes, links, selectedNodeId, viewTransform } = sim;

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const selectedProperties = selectedNode?.properties ?? [];
  const relatedNodeIds = useMemo(() => relatedNodeIdsFor(selectedNode?.id, links), [links, selectedNode?.id]);
  const selectedLinkIds = useMemo(() => selectedLinksFor(selectedNode?.id, links), [links, selectedNode?.id]);

  const openGraphNodePage = useCallback((node: HomeGraphNode) => {
    if (!workspaceId) return;
    const page = createSecondBrainPage(node, node.properties, workspaceId, ownerId);
    usePageStore.setState((state) => {
      const pages = { ...state.pages, [workspaceId]: upsertPage(state.pages[workspaceId] ?? [], page) };
      savePagesCache(pages);
      return derivePageState(pages, state.pageIdsByWorkspace);
    });
    openPage({ id: page._id, workspaceId, kind: "page", title: page.title, icon: page.icon });
  }, [openPage, ownerId, workspaceId]);

  const updateSelectedProperty = useCallback((key: string, value: HomeGraphProperty["value"]) => {
    if (!selectedNode) return;
    updatePageProperty(selectedNode.id, key, value);
  }, [selectedNode, updatePageProperty]);

  const worldTransform = `translate(${viewTransform.x} ${viewTransform.y}) scale(${viewTransform.scale})`;
  const zoomPercent = `${Math.round(viewTransform.scale * 100)}%`;

  return (
    <div className="osionos-home-graph">
      <section className="osionos-home-graph-stage">
        <header className="osionos-home-graph-summary">
          <div>
            <span>Home variant</span>
            <h1>Second Brain</h1>
          </div>
          <div className="osionos-home-graph-stats">
            <Metric label="nodes" value={graph.stats.nodes.toLocaleString()} />
            <Metric label="links" value={graph.stats.links.toLocaleString()} />
            <Metric label="relation props" value={graph.stats.relationProperties.toLocaleString()} />
            <Metric label="databases" value={graph.stats.databases.toLocaleString()} />
          </div>
        </header>

        <div className="osionos-home-graph-controls">
          <button type="button" aria-label="Zoom out" onClick={() => sim.zoomFromCenter(0.88)}><ZoomOut size={16} /></button>
          <span>{zoomPercent}</span>
          <button type="button" aria-label="Zoom in" onClick={() => sim.zoomFromCenter(1.12)}><ZoomIn size={16} /></button>
          <button type="button" aria-label="Reset graph view" onClick={sim.resetViewport}><LocateFixed size={16} /></button>
        </div>

        <svg
          ref={sim.svgRef}
          className="osionos-home-graph-svg"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          aria-label="Second Brain relation graph"
          tabIndex={0}
          data-panning={sim.panPointerRef.current ? "true" : undefined}
          onPointerDown={sim.handleBackgroundPointerDown}
          onPointerMove={sim.handlePointerMove}
          onPointerUp={sim.finishDrag}
          onPointerLeave={sim.finishDrag}
          onKeyDown={sim.handleKeyDown}
        >
          <g className="osionos-home-graph-world" transform={worldTransform}>
            <GraphLinks links={links} selectedLinkIds={selectedLinkIds} />
            <GraphNodes
              nodes={nodes}
              relatedNodeIds={relatedNodeIds}
              selectedNodeId={selectedNode?.id}
              onNodePointerDown={sim.onNodePointerDown}
              isNodePointerMoving={sim.isNodePointerMoving}
              onNodeClick={(node) => openGraphNodePage(node)}
            />
          </g>
        </svg>
      </section>

      <aside className="osionos-home-graph-panel">
        {selectedNode ? (
          <>
            <div className="osionos-home-graph-panel-title">
              <span>{KIND_LABELS[selectedNode.kind]}</span>
              <h2>{selectedNode.title}</h2>
              <p>{selectedNode.group}</p>
              <button type="button" onClick={() => openGraphNodePage(selectedNode)}>Open page</button>
            </div>
            <div className="osionos-home-graph-legend">
              {Object.entries(KIND_LABELS).map(([kind, label]) => (
                <span key={kind}>
                  <i style={{ background: NODE_COLORS[kind as HomeGraphNode["kind"]] }} />
                  {label}
                </span>
              ))}
            </div>
            <div className="osionos-home-graph-properties">
              {selectedProperties.map((property) => (
                <GraphPropertyEditor
                  key={property.key}
                  property={property}
                  onChange={(value) => updateSelectedProperty(property.key, value)}
                  onOpenRelation={(relationId) => {
                    const relationNode = sim.nodesRef.current.find((node) => node.id === relationId);
                    if (relationNode) openGraphNodePage(relationNode);
                  }}
                  relationTitle={(relationId) => sim.nodesRef.current.find((node) => node.id === relationId)?.title ?? relationId}
                />
              ))}
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
};
