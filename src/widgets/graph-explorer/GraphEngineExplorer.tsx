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
 * GraphView + GraphConsole with the app's NodeInspector, plus the chrome the
 * legacy view had (stats bar, offline indicator, empty-state/retry). The engine
 * owns rendering/interaction; the app owns data, editing and BaaS status.
 */

import { type ReactElement, useMemo, useState } from "react";
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
import { NodeInspector } from "@/features/second-brain/ui/NodeInspector";
import { type GraphData, useGraphModel } from "./useGraphModel";
import { useNodeEditing } from "./useNodeEditing";

export function GraphEngineExplorer(): ReactElement {
  const data = useGraphModel();
  const { model, baasMode } = data;
  const engineModel = model as unknown as EngineGraphModel;
  const { controls, update, reset } = useControls("osionos-graph-engine");
  const [engine, setEngine] = useState<GraphEngine | null>(null);
  const [selectedId, setSelectedId] = useState<NodeId | null>(null);

  const legend = useMemo(() => deriveLegend(engineModel), [engineModel]);
  const focusIds = useMemo(
    () => (selectedId ? neighborhood(engineModel, selectedId, 1) : null),
    [engineModel, selectedId],
  );
  const selectedNode = selectedId ? model.nodeById.get(selectedId) ?? null : null;
  const editing = useNodeEditing({
    selectedNode,
    model,
    baasMode,
    setBaasModel: data.setBaasModel,
    state: data.state,
    updatePageProperty: data.updatePageProperty,
  });

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="relative min-h-0 flex-1">
        <GraphView
          model={engineModel}
          controls={controls}
          selectedId={selectedId}
          focusIds={focusIds}
          onSelect={setSelectedId}
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
        />
        <StatsBar data={data} />
        <div className="pointer-events-auto absolute bottom-3 right-3">
          <Minimap engine={engine} />
        </div>
        {model.stats.nodes === 0 ? <EmptyState data={data} /> : null}
        {editing.notice ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <div className="pointer-events-auto max-w-[80%] truncate rounded-lg bg-black/75 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur">
              {editing.notice}
            </div>
          </div>
        ) : null}
      </div>

      <aside className="w-72 shrink-0 overflow-auto border-l border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4 text-sm">
        {selectedNode ? (
          <NodeInspector
            node={selectedNode}
            properties={editing.properties}
            consistency={editing.consistency}
            onCommit={editing.commitField}
            onPromote={editing.promoteToNote}
            onDemote={editing.demoteNote}
            promoteAvailable={baasMode}
          />
        ) : (
          <p className="text-[var(--osio-fg-muted)]">
            Select a node to inspect and edit its record. Double-click a node to expand its
            neighborhood. Notes are a separate color; data nodes are colored by database.
          </p>
        )}
      </aside>
    </div>
  );
}

function StatsBar({ data }: { data: GraphData }): ReactElement {
  const { stats } = data.model;
  const total = data.totalNodes && data.totalNodes > stats.nodes ? ` of ${data.totalNodes.toLocaleString()}` : "";
  return (
    <div className="pointer-events-none absolute left-3 top-3">
      <div className="pointer-events-auto rounded-lg bg-black/40 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
        <span className="font-semibold text-white">Second Brain</span>
        <span className="ml-2">{stats.nodes.toLocaleString()}{total} nodes</span>
        <span className="ml-2">{stats.edges.toLocaleString()} edges</span>
        <span className="ml-2">{stats.databases} databases</span>
        {data.guarantee ? <span className="ml-2 text-white/50">· {data.guarantee}</span> : null}
        {data.offline ? (
          <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200" title="Server unreachable — showing the last synced graph. Edits are saved locally and sync when it's back.">
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
      <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-4 py-3 text-center text-sm text-white/90 backdrop-blur">
        <span>{message}</span>
        {data.baasMode && data.loadError && !data.loading ? (
          <button type="button" onClick={data.retry} className="rounded border border-white/25 px-3 py-1 text-xs transition-colors hover:bg-white/10">
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
