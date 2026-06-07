/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   HomeKnowledgeGraph.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, ZoomIn, ZoomOut } from "lucide-react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import type { Block } from "@/entities/block";
import type { PageEntry, PagePropertyEntry } from "@/entities/page";
import { useUserStore } from "@/features/auth";
import { derivePageState, savePagesCache } from "@/store/pageStore.helpers";
import { usePageStore } from "@/store/usePageStore";
import { useKnownDatabaseStateStore } from "@/widgets/database-view/model/knownDatabaseState";
import {
  createHomeKnowledgeGraph,
  type HomeGraphLink,
  type HomeGraphNode,
  type HomeGraphProperty,
} from "../model/homeKnowledgeGraphData";
import { toPageTreeInput, type PageTreeInput } from "../model/homePageTreeGraph";
import "./homeKnowledgeGraph.css";

interface SimNode extends HomeGraphNode, SimulationNodeDatum {}
interface SimLink extends Omit<HomeGraphLink, "source" | "target">, SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

interface NodePointerState {
  id: string;
  startClientX: number;
  startClientY: number;
  moved: boolean;
}

interface PanPointerState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
}

const VIEWBOX_WIDTH = 1180;
const VIEWBOX_HEIGHT = 760;
const MIN_ZOOM = 0.36;
const MAX_ZOOM = 3.2;
const CLICK_DRAG_THRESHOLD = 5;
const SECOND_BRAIN_PAGE_PREFIX = "second-brain";

const NODE_COLORS: Record<HomeGraphNode["kind"], string> = {
  project: "#2563eb",
  task: "#0f766e",
  crm: "#b45309",
  content: "#be123c",
  inventory: "#4d7c0f",
  product: "#64748b",
  page: "#7c3aed",
  folder: "#94a3b8", // muted slate: a "gap" node that only links/organizes (not a note)
};

const KIND_LABELS: Record<HomeGraphNode["kind"], string> = {
  project: "Projects",
  task: "Tasks",
  crm: "CRM",
  content: "Content",
  inventory: "Inventory",
  product: "Products",
  page: "Pages",
  folder: "Folders",
};

export const HomeKnowledgeGraph: React.FC = () => {
  const knownDatabaseState = useKnownDatabaseStateStore((state) => state.state);
  const updatePageProperty = useKnownDatabaseStateStore((state) => state.updatePageProperty);
  const activeUserId = useUserStore((state) => state.activeUserId);
  const session = useUserStore((state) => state.activeSession());
  const activeWorkspace = useUserStore((state) => state.activeWorkspace());
  const workspaceId = activeWorkspace?._id ?? session?.privateWorkspaces[0]?._id ?? "";
  const ownerId = activeUserId || session?.userId || null;
  const wsPages = usePageStore((state) => state.pages[workspaceId]);
  const pageTree = useMemo<PageTreeInput[]>(() => toPageTreeInput(wsPages), [wsPages]);
  const graph = useMemo(() => createHomeKnowledgeGraph(knownDatabaseState, pageTree), [knownDatabaseState, pageTree]);
  const simulationLinks = useMemo<SimLink[]>(() => graph.links.map((link) => ({ ...link })), [graph.links]);
  const initialNodes = useMemo<SimNode[]>(() => createInitialNodes(graph.nodes, []), [graph.nodes]);
  const [nodes, setNodes] = useState<SimNode[]>(initialNodes);
  const [links, setLinks] = useState<SimLink[]>(simulationLinks);
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodes[0]?.id ?? "");
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [viewTransform, setViewTransform] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const openPage = usePageStore((state) => state.openPage);
  const simulationRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>(initialNodes);
  const nodePointerRef = useRef<NodePointerState | null>(null);
  const panPointerRef = useRef<PanPointerState | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewTransformRef = useRef(viewTransform);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    viewTransformRef.current = viewTransform;
  }, [viewTransform]);

  useEffect(() => {
    const nextNodes = createInitialNodes(graph.nodes, nodesRef.current);
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
    setLinks(simulationLinks.map((link) => ({ ...link })));
  }, [graph.nodes, simulationLinks]);

  useEffect(() => {
    const simulation = forceSimulation<SimNode>(nodesRef.current)
      .force("link", forceLink<SimNode, SimLink>(simulationLinks).id((node) => node.id).distance(linkDistance).strength(linkStrength))
      .force("charge", forceManyBody<SimNode>().strength((node) => node.kind === "product" ? -42 : -105))
      .force("center", forceCenter<SimNode>(VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2))
      .force("collide", forceCollide<SimNode>().radius((node) => Math.max(12, node.size + 8)).iterations(2))
      .alpha(0.95)
      .alphaDecay(0.035);

    let frame = 0;
    simulation.on("tick", () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setNodes([...nodesRef.current]);
        setLinks([...simulationLinks]);
      });
    });
    simulationRef.current = simulation;

    // react-doctor/effect-needs-cleanup: explicitly remove the tick listener
    // alongside `stop()` so any pending tick that fires before stop propagates
    // cannot still call setNodes after unmount.
    return () => {
      cancelAnimationFrame(frame);
      simulation.on("tick", null);
      simulation.stop();
      simulationRef.current = null;
    };
  }, [simulationLinks]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const selectedProperties = selectedNode?.properties ?? [];
  const relatedNodeIds = useMemo(() => relatedNodeIdsFor(selectedNode?.id, links), [links, selectedNode?.id]);
  const selectedLinkIds = useMemo(() => selectedLinksFor(selectedNode?.id, links), [links, selectedNode?.id]);

  const openGraphNodePage = useCallback((node: HomeGraphNode) => {
    if (!workspaceId) return;
    const properties = node.properties;
    const page = createSecondBrainPage(node, properties, workspaceId, ownerId);

    usePageStore.setState((state) => {
      const pages = {
        ...state.pages,
        [workspaceId]: upsertPage(state.pages[workspaceId] ?? [], page),
      };
      savePagesCache(pages);
      return derivePageState(pages, state.pageIdsByWorkspace);
    });
    openPage({ id: page._id, workspaceId, kind: "page", title: page.title, icon: page.icon });
  }, [openPage, ownerId, workspaceId]);

  const updateSelectedProperty = useCallback((key: string, value: HomeGraphProperty["value"]) => {
    if (!selectedNode) return;
    updatePageProperty(selectedNode.id, key, value);
  }, [selectedNode, updatePageProperty]);

  const toSvgPoint = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 };
    const transform = viewTransformRef.current;
    const x = ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT;
    return { x: (x - transform.x) / transform.scale, y: (y - transform.y) / transform.scale };
  }, []);

  const zoomAt = useCallback((clientX: number, clientY: number, multiplier: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = ((clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
    const cursorY = ((clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT;

    setViewTransform((current) => {
      const nextScale = clamp(current.scale * multiplier, MIN_ZOOM, MAX_ZOOM);
      const ratio = nextScale / current.scale;
      return {
        scale: nextScale,
        x: cursorX - (cursorX - current.x) * ratio,
        y: cursorY - (cursorY - current.y) * ratio,
      };
    });
  }, []);

  const zoomFromCenter = useCallback((multiplier: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : VIEWBOX_WIDTH / 2;
    const centerY = rect ? rect.top + rect.height / 2 : VIEWBOX_HEIGHT / 2;
    zoomAt(centerX, centerY, multiplier);
  }, [zoomAt]);

  const resetViewport = useCallback(() => {
    setViewTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const handleWheelNative = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 0.88);
    };
    svg.addEventListener("wheel", handleWheelNative, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheelNative);
  }, [zoomAt]);

  const handlePointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (draggedNodeId) {
      updateNodePointerMovement(event, nodePointerRef.current);
      const point = toSvgPoint(event);
      const node = nodesRef.current.find((candidate) => candidate.id === draggedNodeId);
      if (!node) return;
      node.fx = point.x;
      node.fy = point.y;
      simulationRef.current?.alphaTarget(0.2).restart();
      setNodes([...nodesRef.current]);
      return;
    }

    const panPointer = panPointerRef.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!panPointer || !rect) return;
    const deltaX = ((event.clientX - panPointer.startClientX) / rect.width) * VIEWBOX_WIDTH;
    const deltaY = ((event.clientY - panPointer.startClientY) / rect.height) * VIEWBOX_HEIGHT;
    setViewTransform((current) => ({ ...current, x: panPointer.startX + deltaX, y: panPointer.startY + deltaY }));
  }, [draggedNodeId, toSvgPoint]);

  const finishDrag = useCallback(() => {
    if (draggedNodeId) {
      const node = nodesRef.current.find((candidate) => candidate.id === draggedNodeId);
      if (node) {
        node.fx = undefined;
        node.fy = undefined;
      }
      simulationRef.current?.alphaTarget(0);
      setDraggedNodeId(null);
      nodePointerRef.current = null;
      return;
    }

    const panPointer = panPointerRef.current;
    if (panPointer) svgRef.current?.releasePointerCapture(panPointer.pointerId);
    panPointerRef.current = null;
  }, [draggedNodeId]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<SVGSVGElement>) => {
    const handled = handleGraphKey(event.key, zoomFromCenter, resetViewport, setViewTransform);
    if (handled) event.preventDefault();
  }, [resetViewport, zoomFromCenter]);

  const handleBackgroundPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panPointerRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: viewTransformRef.current.x,
      startY: viewTransformRef.current.y,
    };
  }, []);

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
          <button type="button" aria-label="Zoom out" onClick={() => zoomFromCenter(0.88)}><ZoomOut size={16} /></button>
          <span>{zoomPercent}</span>
          <button type="button" aria-label="Zoom in" onClick={() => zoomFromCenter(1.12)}><ZoomIn size={16} /></button>
          <button type="button" aria-label="Reset graph view" onClick={resetViewport}><LocateFixed size={16} /></button>
        </div>

        <svg
          ref={svgRef}
          className="osionos-home-graph-svg"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          aria-label="Second Brain relation graph"
          tabIndex={0}
          data-panning={panPointerRef.current ? "true" : undefined}
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerLeave={finishDrag}
          onKeyDown={handleKeyDown}
        >
          <g className="osionos-home-graph-world" transform={worldTransform}>
            <GraphLinks links={links} selectedLinkIds={selectedLinkIds} />
            <GraphNodes
              nodes={nodes}
              relatedNodeIds={relatedNodeIds}
              selectedNodeId={selectedNode?.id}
              onNodePointerDown={(event, node) => {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                node.fx = node.x;
                node.fy = node.y;
                nodePointerRef.current = { id: node.id, startClientX: event.clientX, startClientY: event.clientY, moved: false };
                setSelectedNodeId(node.id);
                setDraggedNodeId(node.id);
                simulationRef.current?.alphaTarget(0.25).restart();
              }}
              isNodePointerMoving={() => Boolean(nodePointerRef.current?.moved)}
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
                    const relationNode = nodesRef.current.find((node) => node.id === relationId);
                    if (relationNode) openGraphNodePage(relationNode);
                  }}
                  relationTitle={(relationId) => nodesRef.current.find((node) => node.id === relationId)?.title ?? relationId}
                />
              ))}
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
};

const GraphLinks: React.FC<{ links: SimLink[]; selectedLinkIds: Set<string> }> = ({ links, selectedLinkIds }) => (
  <g className="osionos-home-graph-links">
    {links.map((link) => {
      const source = resolveLinkNode(link.source);
      const target = resolveLinkNode(link.target);
      if (!source || !target) return null;
      return (
        <line
          key={link.id}
          x1={source.x ?? VIEWBOX_WIDTH / 2}
          y1={source.y ?? VIEWBOX_HEIGHT / 2}
          x2={target.x ?? VIEWBOX_WIDTH / 2}
          y2={target.y ?? VIEWBOX_HEIGHT / 2}
          data-relation={link.relation}
          data-related={selectedLinkIds.has(link.id) ? "true" : undefined}
        />
      );
    })}
  </g>
);

const GraphNodes: React.FC<{
  nodes: SimNode[];
  relatedNodeIds: Set<string>;
  selectedNodeId?: string;
  onNodePointerDown: (event: React.PointerEvent<SVGGElement>, node: SimNode) => void;
  isNodePointerMoving: () => boolean;
  onNodeClick: (node: SimNode) => void;
}> = ({ nodes, relatedNodeIds, selectedNodeId, onNodePointerDown, isNodePointerMoving, onNodeClick }) => (
  <g className="osionos-home-graph-nodes">
    {nodes.map((node) => {
      const isSelected = selectedNodeId === node.id;
      const isRelated = isSelected || relatedNodeIds.has(node.id);
      const shouldLabel = isSelected || (isRelated && node.kind !== "product") || node.size > 17;
      return (
        <g
          key={node.id}
          transform={`translate(${node.x ?? VIEWBOX_WIDTH / 2} ${node.y ?? VIEWBOX_HEIGHT / 2})`}
          data-kind={node.kind}
          data-related={isRelated ? "true" : undefined}
          data-selected={isSelected ? "true" : undefined}
          onPointerDown={(event) => onNodePointerDown(event, node)}
          onPointerUp={() => {
            if (!isNodePointerMoving()) onNodeClick(node);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onNodeClick(node);
          }}
        >
          <circle className="osionos-home-graph-hit-target" r={Math.max(18, node.size + 10)} />
          <circle r={Math.max(7, node.size)} fill={NODE_COLORS[node.kind]} />
          {shouldLabel ? <text x={node.size + 8} y="4">{node.title}</text> : null}
        </g>
      );
    })}
  </g>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const GraphPropertyEditor: React.FC<{
  property: HomeGraphProperty;
  onChange: (value: HomeGraphProperty["value"]) => void;
  onOpenRelation: (relationId: string) => void;
  relationTitle: (relationId: string) => string;
}> = ({ property, onChange, onOpenRelation, relationTitle }) => {
  const value = property.value;

  if (property.type === "checkbox") {
    return (
      <label className="osionos-home-graph-property">
        <span>{property.label}</span>
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
      </label>
    );
  }

  if ((property.type === "select" || property.type === "status") && property.options?.length) {
    return (
      <label className="osionos-home-graph-property">
        <span>{property.label}</span>
        <select value={stringValue(value)} onChange={(event) => onChange(event.target.value)}>
          {property.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }

  if (property.type === "relation") {
    const relations = Array.isArray(value) ? value : [];
    return (
      <div className="osionos-home-graph-property osionos-home-graph-property--relation">
        <span>{property.label}</span>
        <div>
          {relations.length ? relations.map((relation) => <button key={relation} type="button" onClick={() => onOpenRelation(relation)}>{relationTitle(relation)}</button>) : <em>No relations</em>}
        </div>
      </div>
    );
  }

  const inputType = propertyInputType(property.type);

  return (
    <label className="osionos-home-graph-property">
      <span>{property.label}</span>
      <input
        type={inputType}
        value={inputValue(value, property.type)}
        onChange={(event) => onChange(property.type === "number" ? Number(event.target.value) : event.target.value)}
      />
    </label>
  );
};

function createInitialNodes(nodes: HomeGraphNode[], previousNodes: SimNode[]): SimNode[] {
  return nodes.map((node, index) => {
    const previousNode = previousNodes.find((candidate) => candidate.id === node.id);
    const center = nodeCenter(node.kind);
    const angle = seededAngle(node.id, index);
    const radius = 42 + seededRadius(node.id, index);
    return {
      ...node,
      x: previousNode?.x ?? center.x + Math.cos(angle) * radius,
      y: previousNode?.y ?? center.y + Math.sin(angle) * radius,
    };
  });
}

function nodeCenter(kind: HomeGraphNode["kind"]): { x: number; y: number } {
  const centers: Record<HomeGraphNode["kind"], { x: number; y: number }> = {
    project: { x: 330, y: 245 },
    task: { x: 590, y: 250 },
    crm: { x: 840, y: 260 },
    content: { x: 400, y: 540 },
    inventory: { x: 670, y: 535 },
    product: { x: 900, y: 515 },
    page: { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 },
    folder: { x: VIEWBOX_WIDTH / 2, y: 150 },
  };
  return centers[kind];
}

function seededAngle(id: string, fallback: number): number {
  return (hashString(id) || fallback + 1) * 0.001618;
}

function seededRadius(id: string, fallback: number): number {
  return ((hashString(`${id}:${fallback}`) % 140) + Math.floor(fallback / 8) * 14);
}

function linkDistance(link: SimLink): number {
  return 70 / Math.max(0.4, link.strength);
}

function linkStrength(link: SimLink): number {
  return Math.min(0.6, 0.12 * link.strength);
}

function updateNodePointerMovement(event: React.PointerEvent<SVGSVGElement>, pointer: NodePointerState | null): void {
  if (!pointer) return;
  const distance = Math.hypot(event.clientX - pointer.startClientX, event.clientY - pointer.startClientY);
  pointer.moved = pointer.moved || distance > CLICK_DRAG_THRESHOLD;
}

function handleGraphKey(
  key: string,
  zoomFromCenter: (multiplier: number) => void,
  resetViewport: () => void,
  setViewTransform: React.Dispatch<React.SetStateAction<ViewTransform>>,
): boolean {
  if (key === "+" || key === "=") {
    zoomFromCenter(1.12);
    return true;
  }
  if (key === "-" || key === "_") {
    zoomFromCenter(0.88);
    return true;
  }
  if (key === "0") {
    resetViewport();
    return true;
  }
  const delta = keyPanDelta(key);
  if (!delta) return false;
  setViewTransform((current) => ({ ...current, x: current.x + delta.x, y: current.y + delta.y }));
  return true;
}

function keyPanDelta(key: string): { x: number; y: number } | null {
  if (key === "ArrowLeft") return { x: 42, y: 0 };
  if (key === "ArrowRight") return { x: -42, y: 0 };
  if (key === "ArrowUp") return { x: 0, y: 42 };
  if (key === "ArrowDown") return { x: 0, y: -42 };
  return null;
}

function relatedNodeIdsFor(selectedNodeId: string | undefined, links: SimLink[]): Set<string> {
  const relatedIds = new Set<string>();
  if (!selectedNodeId) return relatedIds;
  relatedIds.add(selectedNodeId);
  for (const link of links) {
    const sourceId = linkEndpointId(link.source);
    const targetId = linkEndpointId(link.target);
    if (sourceId === selectedNodeId && targetId) relatedIds.add(targetId);
    if (targetId === selectedNodeId && sourceId) relatedIds.add(sourceId);
  }
  return relatedIds;
}

function selectedLinksFor(selectedNodeId: string | undefined, links: SimLink[]): Set<string> {
  if (!selectedNodeId) return new Set<string>();
  return new Set(links
    .filter((link) => linkEndpointId(link.source) === selectedNodeId || linkEndpointId(link.target) === selectedNodeId)
    .map((link) => link.id));
}

function resolveLinkNode(value: SimLink["source"]): SimNode | null {
  return typeof value === "string" ? null : value;
}

function linkEndpointId(value: SimLink["source"]): string | null {
  return typeof value === "string" ? value : value.id;
}

function createSecondBrainPage(
  node: HomeGraphNode,
  properties: HomeGraphProperty[],
  workspaceId: string,
  activeUserId: string | null,
): PageEntry {
  const now = new Date().toISOString();
  return {
    _id: secondBrainPageId(node),
    title: node.title,
    updatedAt: now,
    workspaceId,
    ownerId: activeUserId,
    visibility: "private",
    collaborators: [],
    parentPageId: null,
    databaseId: node.databaseId,
    archivedAt: null,
    surface: "page",
    properties: properties.map(toPageProperty),
    content: createSecondBrainContent(node, properties),
  };
}

function createSecondBrainContent(node: HomeGraphNode, properties: HomeGraphProperty[]): Block[] {
  const relationProperties = properties.filter((property) => property.type === "relation");
  const scalarProperties = properties.filter((property) => property.type !== "relation").slice(0, 8);
  return [
    block(node, "summary", "callout", `${KIND_LABELS[node.kind]} / ${node.group}`),
    block(node, "properties-heading", "heading_2", "Properties"),
    ...scalarProperties.map((property) => block(node, `prop-${property.key}`, "bulleted_list", `${property.label}: ${formatPropertyValue(property.value)}`)),
    block(node, "relations-heading", "heading_2", "Relations"),
    ...relationProperties.map((property) => block(node, `relation-${property.key}`, "bulleted_list", `${property.label}: ${formatPropertyValue(property.value)}`)),
  ];
}

function block(node: HomeGraphNode, suffix: string, type: Block["type"], content: string): Block {
  return { id: `${secondBrainPageId(node)}-${suffix}`, type, content };
}

function toPageProperty(property: HomeGraphProperty): PagePropertyEntry {
  return {
    key: property.key,
    label: property.label,
    type: pagePropertyType(property.type),
    value: property.value,
    options: property.options,
    relationTarget: property.type === "relation" ? "page" : undefined,
  };
}

function pagePropertyType(type: HomeGraphProperty["type"]): PagePropertyEntry["type"] {
  if (type === "number") return "number";
  if (type === "checkbox") return "checkbox";
  if (type === "date" || type === "created_time" || type === "last_edited_time" || type === "due_date") return "date";
  if (type === "select" || type === "status") return "select";
  if (type === "url") return "url";
  if (type === "relation") return "relation";
  return "text";
}

function secondBrainPageId(node: HomeGraphNode): string {
  return `${SECOND_BRAIN_PAGE_PREFIX}-${node.kind}-${node.id}`.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
}

function upsertPage(workspacePages: PageEntry[], page: PageEntry): PageEntry[] {
  const existingIndex = workspacePages.findIndex((candidate) => candidate._id === page._id);
  if (existingIndex === -1) return [page, ...workspacePages];
  return workspacePages.map((candidate, index) => index === existingIndex ? { ...candidate, ...page } : candidate);
}

function inputValue(value: HomeGraphProperty["value"], type: HomeGraphProperty["type"]): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value == null) return "";
  if (type === "date" && typeof value === "string" && value.includes("T")) return value.slice(0, 10);
  return String(value);
}

function propertyInputType(type: HomeGraphProperty["type"]): React.HTMLInputTypeAttribute {
  if (type === "number") return "number";
  if (type === "date" || type === "created_time" || type === "last_edited_time" || type === "due_date") return "date";
  return "text";
}

function stringValue(value: HomeGraphProperty["value"]): string {
  if (Array.isArray(value)) return value[0] ?? "";
  if (value == null) return "";
  return String(value);
}

function formatPropertyValue(value: HomeGraphProperty["value"]): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value == null) return "";
  return String(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + (value.codePointAt(index) ?? 0);
  }
  return Math.abs(hash);
}
