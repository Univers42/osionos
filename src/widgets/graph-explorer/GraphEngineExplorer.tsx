/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   GraphEngineExplorer.tsx                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * App-side mount for the decoupled @osionos/graph-engine. Composes the package's
 * GraphView + GraphConsole with the chrome the legacy view had (stats bar, offline
 * indicator, empty-state/retry). The engine owns rendering/interaction; the app
 * owns data + BaaS status. Selecting a node focuses its neighborhood in-canvas.
 */

import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type GraphEngine,
  type GraphModel as EngineGraphModel,
  type NodeId,
  GraphConsole,
  GraphView,
  Minimap,
  deriveLegend,
  neighborhood,
  useControls,
} from "@osionos/graph-engine";
import "@osionos/graph-engine/styles/graph.css";
import { pageEntryToTab } from "@/widgets/workspace-grid/model/pageToTab";
import { useWorkspaceLayout } from "@/widgets/workspace-grid/model/workspaceLayout";
import { type GraphData, useGraphModel } from "./useGraphModel";
import { loadPageById, pageIdFromNodeId } from "./nodePreview";
import { isRecordNodeId, openRecordNode } from "./recordOpen";
import { NodeHoverPreview } from "./NodeHoverPreview";

export function GraphEngineExplorer(): ReactElement {
  const data = useGraphModel();
  const { model } = data;
  const engineModel = model as unknown as EngineGraphModel;
  const { controls, update, reset } = useControls("osionos-graph-engine");
  const [engine, setEngine] = useState<GraphEngine | null>(null);
  const [selectedId, setSelectedId] = useState<NodeId | null>(null);
  const [hoveredId, setHoveredId] = useState<NodeId | null>(null);
  const [modHeld, setModHeld] = useState(false);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const modRef = useRef(false);
  const cursorRef = useRef({ x: 0, y: 0 });

  // Ctrl/⌘ held → preview-on-hover + click-to-open mode; released → preview stops.
  useEffect(() => {
    const sync = (e: KeyboardEvent) => {
      const down = e.ctrlKey || e.metaKey;
      modRef.current = down;
      setModHeld(down);
      if (down) setCursor(cursorRef.current); // snap to cursor even without a move
    };
    const clear = () => { modRef.current = false; setModHeld(false); };
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", clear);
    };
  }, []);

  // A NodeId is composite. A NOTE node (osionos:osionos_pages:<id>) resolves to a
  // real page id, loaded (store or bridge) and opened as a tab like search results.
  // A RECORD node (<dbId>:<resource>:<pk>) is upserted into a deterministic note by
  // the bridge first, then opened the same way. Tag/synthetic ids no-op.
  const openNode = useCallback((id: NodeId) => {
    const nodeId = String(id);
    if (isRecordNodeId(nodeId)) {
      void openRecordNode(nodeId).then((page) => {
        if (page) useWorkspaceLayout.getState().openTab(pageEntryToTab(page));
      });
      return;
    }
    const pageId = pageIdFromNodeId(nodeId);
    if (!pageId) return;
    void loadPageById(pageId).then((page) => {
      if (page) useWorkspaceLayout.getState().openTab(pageEntryToTab(page));
    });
  }, []);

  // Ctrl/⌘ + click opens the note; a plain click selects + focuses its neighborhood.
  const handleSelect = useCallback((id: NodeId | null) => {
    if (id !== null && modRef.current) { openNode(id); return; }
    setSelectedId(id);
  }, [openNode]);

  // Debounce the Ctrl+hover preview so scrubbing across nodes doesn't fetch each one.
  const [debouncedNode, setDebouncedNode] = useState<NodeId | null>(null);
  useEffect(() => {
    if (!modHeld || hoveredId === null) return;
    const target = hoveredId;
    const timer = setTimeout(() => setDebouncedNode(target), 220);
    return () => clearTimeout(timer);
  }, [modHeld, hoveredId]);

  const previewPageId = modHeld && hoveredId !== null && hoveredId === debouncedNode
    ? pageIdFromNodeId(String(hoveredId))
    : null;

  const legend = useMemo(() => deriveLegend(engineModel), [engineModel]);
  const focusIds = useMemo(
    () => (selectedId ? neighborhood(engineModel, selectedId, 1) : null),
    [engineModel, selectedId],
  );

  return (
    <div
      className="relative h-full min-h-0 w-full"
      onMouseMove={(e) => {
        cursorRef.current = { x: e.clientX, y: e.clientY };
        if (modRef.current) setCursor(cursorRef.current);
      }}
    >
      <GraphView
        model={engineModel}
        controls={controls}
        selectedId={selectedId}
        focusIds={focusIds}
        onSelect={handleSelect}
        onHover={setHoveredId}
        onExpand={data.expand}
        onReady={setEngine}
      />
      <GraphConsole
        controls={controls}
        update={update}
        reset={reset}
        legend={legend}
        engine={engine}
        onSelect={setSelectedId}
        scopeControl={
          <div className="flex items-center gap-1.5 px-3 py-2 text-xs">
            <span className="mr-0.5 text-[var(--osio-fg-muted)]">Scope</span>
            <button
              type="button"
              onClick={() => data.setScope("workspace")}
              className={`rounded px-1.5 py-0.5 transition-colors ${data.scope === "workspace" ? "bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]" : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"}`}
            >
              This workspace
            </button>
            <button
              type="button"
              onClick={() => data.setScope("all")}
              className={`rounded px-1.5 py-0.5 transition-colors ${data.scope === "all" ? "bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]" : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"}`}
            >
              All workspaces
            </button>
            <button
              type="button"
              onClick={() => data.setScope("all-data")}
              title="Every database your workspaces are linked to — notes + records from all engines"
              className={`rounded px-1.5 py-0.5 transition-colors ${data.scope === "all-data" ? "bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]" : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"}`}
            >
              All data
            </button>
          </div>
        }
      />
      <StatsBar data={data} />
      <div className="pointer-events-auto absolute bottom-3 right-3">
        <Minimap engine={engine} />
      </div>
      {model.stats.nodes === 0 ? <EmptyState data={data} /> : null}
      {previewPageId && (
        <NodeHoverPreview key={previewPageId} pageId={previewPageId} x={cursor.x} y={cursor.y} />
      )}
    </div>
  );
}

function StatsBar({ data }: { data: GraphData }): ReactElement {
  const { stats } = data.model;
  const total = data.totalNodes && data.totalNodes > stats.nodes ? ` of ${data.totalNodes.toLocaleString()}` : "";
  return (
    <div className="pointer-events-none absolute left-3 top-3">
      <div className="pointer-events-auto rounded-[var(--osio-radius-panel)] border border-[var(--osio-graph-overlay-border)] bg-[var(--osio-graph-overlay-bg)] px-3 py-1.5 text-xs text-[var(--osio-graph-overlay-muted)] shadow-[var(--osio-e2)] backdrop-blur">
        <span className="font-semibold text-[var(--osio-graph-overlay-fg)]">Second Brain</span>
        <span className="ml-2">{stats.nodes.toLocaleString()}{total} nodes</span>
        <span className="ml-2">{stats.edges.toLocaleString()} edges</span>
        <span className="ml-2">{stats.databases} databases</span>
        {data.guarantee ? <span className="ml-2 opacity-70">· {data.guarantee}</span> : null}
        {data.offline ? (
          <span className="ml-2 rounded-full bg-[var(--osio-warning)]/15 px-2 py-0.5 text-[var(--osio-warning)]" title="Server unreachable — showing the last synced graph. Edits are saved locally and sync when it's back.">
            ● offline · cached
          </span>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({ data }: { data: GraphData }): ReactElement {
  const message = !data.baasMode
    ? "No local data to graph — the database seed is empty."
    : data.loading
      ? "Connecting to the BaaS graph…"
      : data.loadError
        ? `Couldn't load from the BaaS — ${data.loadError}. Is it running? (docker ps | grep kong)`
        : "No nodes returned from the BaaS.";
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-2 rounded-[var(--osio-radius-panel)] border border-[var(--osio-graph-overlay-border)] bg-[var(--osio-graph-overlay-bg)] px-4 py-3 text-center text-sm text-[var(--osio-graph-overlay-fg)] shadow-[var(--osio-e3)] backdrop-blur">
        <span>{message}</span>
        {data.baasMode && data.loadError && !data.loading ? (
          <button type="button" onClick={data.retry} className="rounded-[var(--osio-radius-control)] border border-[var(--osio-graph-overlay-border)] px-3 py-1 text-xs transition-colors duration-[var(--osio-dur-fast)] hover:bg-[var(--osio-bg-hover)]">
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
