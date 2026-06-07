/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   useGraphSimulation.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Simulation } from "d3-force";

import type { HomeKnowledgeGraph } from "../model/homeKnowledgeGraphData";
import {
  type NodePointerState, type PanPointerState, type SimLink, type SimNode, type ViewTransform,
  MAX_ZOOM, MIN_ZOOM, VIEWBOX_HEIGHT, VIEWBOX_WIDTH,
} from "./homeGraphModel";
import { createInitialNodes } from "./homeGraphLayout";
import { clamp, createSimulation } from "./homeGraphForces";
import { handleGraphKey, updateNodePointerMovement } from "./homeGraphInteraction";

/** Owns the d3-force simulation + the viewport (zoom/pan) + node drag for the Second Brain graph. */
export function useGraphSimulation(graph: HomeKnowledgeGraph) {
  const simulationLinks = useMemo<SimLink[]>(() => graph.links.map((link) => ({ ...link })), [graph.links]);
  const initialNodes = useMemo<SimNode[]>(() => createInitialNodes(graph.nodes, []), [graph.nodes]);
  const [nodes, setNodes] = useState<SimNode[]>(initialNodes);
  const [links, setLinks] = useState<SimLink[]>(simulationLinks);
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodes[0]?.id ?? "");
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [viewTransform, setViewTransform] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const simulationRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>(initialNodes);
  const nodePointerRef = useRef<NodePointerState | null>(null);
  const panPointerRef = useRef<PanPointerState | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewTransformRef = useRef(viewTransform);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { viewTransformRef.current = viewTransform; }, [viewTransform]);

  useEffect(() => {
    const nextNodes = createInitialNodes(graph.nodes, nodesRef.current);
    nodesRef.current = nextNodes;
    setNodes(nextNodes);
    setLinks(simulationLinks.map((link) => ({ ...link })));
  }, [graph.nodes, simulationLinks]);

  useEffect(() => {
    const simulation = createSimulation(nodesRef.current, simulationLinks);
    let frame = 0;
    simulation.on("tick", () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setNodes([...nodesRef.current]);
        setLinks([...simulationLinks]);
      });
    });
    simulationRef.current = simulation;
    return () => {
      cancelAnimationFrame(frame);
      simulation.on("tick", null);
      simulation.stop();
      simulationRef.current = null;
    };
  }, [simulationLinks]);

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
      return { scale: nextScale, x: cursorX - (cursorX - current.x) * ratio, y: cursorY - (cursorY - current.y) * ratio };
    });
  }, []);

  const zoomFromCenter = useCallback((multiplier: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : VIEWBOX_WIDTH / 2;
    const centerY = rect ? rect.top + rect.height / 2 : VIEWBOX_HEIGHT / 2;
    zoomAt(centerX, centerY, multiplier);
  }, [zoomAt]);

  const resetViewport = useCallback(() => setViewTransform({ x: 0, y: 0, scale: 1 }), []);

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
      if (node) { node.fx = undefined; node.fy = undefined; }
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
    if (handleGraphKey(event.key, zoomFromCenter, resetViewport, setViewTransform)) event.preventDefault();
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

  const onNodePointerDown = useCallback((event: React.PointerEvent<SVGGElement>, node: SimNode) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    node.fx = node.x;
    node.fy = node.y;
    nodePointerRef.current = { id: node.id, startClientX: event.clientX, startClientY: event.clientY, moved: false };
    setSelectedNodeId(node.id);
    setDraggedNodeId(node.id);
    simulationRef.current?.alphaTarget(0.25).restart();
  }, []);

  const isNodePointerMoving = useCallback(() => Boolean(nodePointerRef.current?.moved), []);

  return {
    nodes, links, selectedNodeId, setSelectedNodeId, viewTransform,
    svgRef, panPointerRef, nodesRef, zoomFromCenter, resetViewport,
    handlePointerMove, finishDrag, handleKeyDown, handleBackgroundPointerDown,
    onNodePointerDown, isNodePointerMoving,
  };
}
