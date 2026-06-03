/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   SecondBrainView.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/02 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/02 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed, Maximize2, Search, ZoomIn, ZoomOut } from "lucide-react";
import type { NotionState } from "@notion-db/object-database";

import { useKnownDatabaseStateStore } from "@/widgets/database-view/model/knownDatabaseState";
import { usePageStore } from "@/store/usePageStore";
import { useUserStore } from "@/features/auth";
import { loadGraphSnapshot, saveGraphSnapshot } from "../sync/graphSnapshot";
import { GRAPH_SOURCE } from "../featureFlag";
import { type GraphModel, type NodeId, emptyModel } from "../model/graphModel";
import { deriveGraph } from "../model/deriveGraph";
import { deriveTagConfig } from "../model/deriveTagConfig";
import { diffGraph } from "../model/diffGraph";
import { type SearchIndex, buildSearchIndex, neighborhood } from "../model/selectors";
import { databaseColor } from "../model/palette";
import { LayoutController } from "../layout/layoutBridge";
import { CanvasScene } from "../render/CanvasScene";
import { resolveSceneTheme } from "../render/theme";
import { accumulateGraph } from "../baas/accumulateGraph";
import { configuredResources, edgesMount, edgesTable, fetchGraphFocus, isBaasGraphEnabled, overlayTable } from "../baas/baasGraphClient";
import { PAGE_GRAPH_RESOURCE, fetchCombinedOverview } from "../baas/pageGraphSource";
import { aggregateCount } from "../baas/baasAggregate";
import { mapGraphResponse } from "../baas/mapGraphResponse";
import type { BaasGraphResponse } from "../baas/types";
import { commitTxn, txnApplied } from "../baas/baasTxnClient";
import { BaasError } from "../baas/baasFetch";
import { buildRecordUpdate, parseNodeId } from "../baas/buildRecordTxn";
import { buildDemoteTxn, buildPromoteTxn, overlayNodeId } from "../baas/buildNoteTxn";
import { patchNodeFields } from "../baas/patchNode";
import { applyDemote, applyPromote } from "../baas/notePatch";
import { Minimap } from "./Minimap";
import { type InspectorProperty, NodeInspector } from "./NodeInspector";

/** Stable empty model so the BaaS-mode "not loaded yet" state has a fixed identity. */
const EMPTY_MODEL = emptyModel();
/** When offline (snapshot shown), re-attempt the server on this cadence. */
const RECONNECT_POLL_MS = 15000;

/**
 * Second Brain orchestrator (docs 04/05, Phase 3 writes). React renders only the
 * chrome; the graph is drawn imperatively by `CanvasScene` from worker-streamed
 * positions. Reads come from the local canonical state or — when configured —
 * the live BaaS `/graph` endpoints; inspector edits write to the local store
 * (local mode) or an atomic `/txn` batch (BaaS mode) with optimistic apply.
 */
export const SecondBrainView: React.FC = () => {
  const state = useKnownDatabaseStateStore((store) => store.state);
  const updatePageProperty = useKnownDatabaseStateStore((store) => store.updatePageProperty);
  const baasMode = isBaasGraphEnabled();
  const viewerId = useUserStore((store) => store.activeUserId) || null;
  const noteResources = useMemo(() => new Set([PAGE_GRAPH_RESOURCE]), []);
  const localModel = useMemo(() => deriveGraph(state, { source: GRAPH_SOURCE, tagConfig: deriveTagConfig(state) }), [state]);

  const [baasModel, setBaasModel] = useState<GraphModel | null>(null);
  const [guarantee, setGuarantee] = useState<string | null>(null);
  const [totalNodes, setTotalNodes] = useState<number | null>(null);
  const model = baasMode ? baasModel ?? EMPTY_MODEL : localModel;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<CanvasScene | null>(null);
  const controllerRef = useRef<LayoutController | null>(null);
  const modelRef = useRef<GraphModel>(EMPTY_MODEL);
  const searchRef = useRef<SearchIndex | null>(null);
  const expandRef = useRef<((id: NodeId) => void) | null>(null);

  const [scene, setScene] = useState<CanvasScene | null>(null);
  const [selectedId, setSelectedId] = useState<NodeId | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(baasMode); // BaaS mode starts in a loading state
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false); // rendering the cached snapshot
  const [reloadKey, setReloadKey] = useState(0);

  // Create the engine once; tear it down on unmount.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    const rect = container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    const controller = new LayoutController({
      width,
      height,
      onPositions: (x, y) => sceneRef.current?.setPositions(x, y),
    });
    const newScene = new CanvasScene(canvas, resolveSceneTheme(document.documentElement), {
      onSelect: (id) => setSelectedId(id),
      onHover: () => undefined,
      onNodeDragStart: () => controller.reheat(),
      onNodeDrag: (id, worldX, worldY) => controller.pinNode(id, worldX, worldY),
      onNodeDragEnd: (id) => controller.unpinNode(id),
      onExpand: (id) => expandRef.current?.(id),
    });
    newScene.setSize(width, height, globalThis.devicePixelRatio || 1);

    sceneRef.current = newScene;
    controllerRef.current = controller;
    setScene(newScene);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) newScene.setSize(entry.contentRect.width, entry.contentRect.height, globalThis.devicePixelRatio || 1);
    });
    resizeObserver.observe(container);

    const themeObserver = new MutationObserver(() => newScene.setTheme(resolveSceneTheme(document.documentElement)));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      newScene.destroy();
      controller.dispose();
      sceneRef.current = null;
      controllerRef.current = null;
      setScene(null);
    };
  }, []);

  // Push the model into the scene; only reheat the layout on STRUCTURAL changes
  // (added/removed nodes or edges) — field/label edits just redraw.
  useEffect(() => {
    const previous = modelRef.current;
    modelRef.current = model;
    searchRef.current = buildSearchIndex(model);
    sceneRef.current?.setGraph(model);
    sceneRef.current?.setLabels(model.nodes.map((node) => node.label));

    const patch = diffGraph(previous, model);
    const structural =
      patch.addedNodes.length > 0 ||
      patch.removedNodeIds.length > 0 ||
      patch.addedEdges.length > 0 ||
      patch.removedEdgeIds.length > 0;
    if (structural) controllerRef.current?.rebuild(model);
  }, [model]);

  // Selection drives the inspector + focus dimming.
  useEffect(() => {
    const current = sceneRef.current;
    if (!current) return;
    current.setSelected(selectedId);
    current.setFocus(selectedId ? neighborhood(modelRef.current, selectedId, 1).nodeIds : null);
  }, [selectedId]);

  // Legend filters toggle whole databases.
  useEffect(() => {
    sceneRef.current?.setHiddenDatabases(hidden);
  }, [hidden]);

  // Auto-dismiss the transient notice (write/read feedback — doc 02 §9).
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  // BaaS mode: double-click a node to fetch + merge its neighborhood.
  const expand = useCallback((id: NodeId) => {
    if (!baasMode) return;
    // Page (note) nodes arrive complete from the bridge overview (parent + tag edges);
    // /query/v1 has no `osionos` mount, so don't attempt a focus fetch for them.
    if (parseNodeId(id).resource === PAGE_GRAPH_RESOURCE) return;
    fetchGraphFocus(id)
      .then((response) => {
        const mapped = mapGraphResponse(response, { noteResources, viewerId });
        setBaasModel((prev) => accumulateGraph(prev ?? EMPTY_MODEL, mapped.model));
        setGuarantee(mapped.guarantee);
      })
      .catch(() => setNotice("Couldn't expand this node from the BaaS."));
  }, [baasMode, noteResources, viewerId]);
  useEffect(() => { expandRef.current = expand; }, [expand]);

  // BaaS mode: bootstrap the bounded whole-vault overview, retrying transient
  // failures (the BaaS auth chain can flap during redeploys) so the graph fills
  // in as soon as the backend recovers — no manual refresh needed.
  useEffect(() => {
    if (!baasMode) return undefined;
    let active = true;
    const mapOptions = { noteResources, viewerId };
    const applyResponse = (response: BaasGraphResponse, fromCache: boolean) => {
      const mapped = mapGraphResponse(response, mapOptions);
      setBaasModel(mapped.model);
      setGuarantee(mapped.guarantee);
      setOffline(fromCache);
      setLoadError(null);
      setLoading(false);
    };
    // Server unreachable after retries → render the last-good snapshot read-only so
    // the graph isn't void; edits keep flowing into the local outbox meanwhile.
    const fallbackOffline = (error: unknown) => {
      const snapshot = loadGraphSnapshot();
      if (snapshot) {
        applyResponse(snapshot.response, true);
        setNotice("Server unreachable — showing the last synced graph. Your edits are saved locally and will sync when it's back.");
      } else {
        setLoadError(error instanceof BaasError ? `BaaS ${error.status}: ${error.message}` : "couldn't reach the BaaS");
        setOffline(false);
        setLoading(false);
      }
    };
    void (async () => {
      for (let attempt = 0; attempt < 4 && active; attempt += 1) {
        try {
          const response = await fetchCombinedOverview();
          if (!active) return;
          saveGraphSnapshot(response); // cache the last-good graph for offline
          applyResponse(response, false);
          return;
        } catch (error) {
          if (!active) return;
          if (attempt === 3) fallbackOffline(error);
          else await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    })();
    return () => { active = false; };
  }, [baasMode, noteResources, viewerId, reloadKey]);

  // While offline (rendering the snapshot), poll for the server's return so the
  // graph auto-refreshes the moment it's reachable — no manual Retry needed.
  useEffect(() => {
    if (!baasMode || !offline) return undefined;
    const interval = setInterval(() => setReloadKey((key) => key + 1), RECONNECT_POLL_MS);
    return () => clearInterval(interval);
  }, [baasMode, offline]);

  const retryLoad = () => {
    setLoading(true);
    setLoadError(null);
    setReloadKey((key) => key + 1);
  };

  // Live refresh: editing a page persists it (App's usePageSync outbox); re-fetch the
  // overview shortly after so the change appears in the graph without a manual Retry.
  useEffect(() => {
    if (!baasMode) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = usePageStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setReloadKey((key) => key + 1), 2500);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [baasMode]);

  // BaaS mode: true per-resource totals via aggregate (the overview is a bounded
  // sample) — so the stats bar can honestly say "shown of total".
  useEffect(() => {
    if (!baasMode) return undefined;
    let active = true;
    // Per-resource counts — only on the (relational) edges mount, since Mongo
    // doesn't support aggregate. Settle independently so one failure is harmless.
    Promise.allSettled(
      configuredResources()
        .filter((resource) => resource.dbId === edgesMount())
        .map((resource) => aggregateCount(resource.dbId, resource.table)),
    )
      .then((results) => {
        if (!active) return;
        const total = results.reduce((sum, result) => sum + (result.status === "fulfilled" ? result.value : 0), 0);
        if (total > 0) setTotalNodes(total);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [baasMode]);

  const toggleDatabase = (databaseId: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(databaseId)) next.delete(databaseId);
      else next.add(databaseId);
      return next;
    });
  };

  const runSearch = (raw: string) => {
    const hit = searchRef.current?.search(raw, 1)[0];
    if (hit) {
      setSelectedId(hit);
      sceneRef.current?.focusOn(hit);
    }
  };

  const selectedNode = selectedId ? model.nodeById.get(selectedId) ?? null : null;

  const properties = useMemo<InspectorProperty[]>(() => {
    if (!selectedNode) return [];
    if (baasMode) {
      return Object.entries(selectedNode.fields ?? {})
        .map(([key, value]) => ({ key, label: key, value: formatValue(value) }))
        .filter((property) => property.value.length > 0)
        .slice(0, 12);
    }
    return localRecordProperties(selectedNode.id, selectedNode.databaseId, state);
  }, [selectedNode, baasMode, state]);

  // Commit a single field edit: local store (local mode) or atomic /txn (BaaS).
  // A no-op / not-owned write returns 201 with rowCount 0, so we revert the
  // optimistic patch unless the txn actually changed a row (txn-contract §2.5).
  const commitField = (key: string, value: string) => {
    if (!selectedNode) return;
    if (baasMode) {
      const node = selectedNode;
      const previous = node.fields?.[key];
      const revert = () => setBaasModel((prev) => (prev ? patchNodeFields(prev, node.id, { [key]: previous }) : prev));
      setBaasModel((prev) => (prev ? patchNodeFields(prev, node.id, { [key]: value }) : prev));
      commitTxn(buildRecordUpdate(node.id, { [key]: value }))
        .then((result) => { if (!txnApplied(result)) { revert(); setNotice("No change saved — you may not own this record."); } })
        .catch((error) => { revert(); setNotice(describeWriteError(error)); });
    } else {
      const prefix = `${GRAPH_SOURCE}:${selectedNode.databaseId}:`;
      const recordId = selectedNode.id.startsWith(prefix) ? selectedNode.id.slice(prefix.length) : selectedNode.id;
      updatePageProperty(recordId, key, value);
    }
  };

  // Phase 5 — promote a data record into a note overlay (atomic, same mount).
  const promoteToNote = () => {
    if (!baasMode || !selectedNode || selectedNode.kind === "note" || selectedNode.hasNote) return;
    const node = selectedNode;
    const mount = edgesMount();
    const overlayId = crypto.randomUUID();
    const edgeId = crypto.randomUUID();
    const body = `Notes on ${node.label}`;
    const echo = {
      overlayNodeId: overlayNodeId(mount, overlayTable(), overlayId),
      body,
      sourceNodeId: node.id,
      edgeRecordId: edgeId,
    };
    setBaasModel((prev) => (prev ? applyPromote(prev, echo) : prev));
    const request = buildPromoteTxn({
      mount,
      overlayResource: overlayTable(),
      edgesResource: edgesTable(),
      overlayId,
      edgeId,
      sourceNodeId: node.id,
      body,
    });
    const revertPromote = () => setBaasModel((prev) => (prev ? applyDemote(prev, echo.overlayNodeId, node.id) : prev));
    commitTxn(request)
      .then((result) => { if (!txnApplied(result)) { revertPromote(); setNotice("Couldn't create the note."); } })
      .catch((error) => { revertPromote(); setNotice(describeWriteError(error)); });
  };

  // Phase 5 — demote: remove the overlay + its note_of edge (atomic).
  const demoteNote = () => {
    if (!baasMode || !selectedNode) return;
    const node = selectedNode;
    const noteEdge = modelRef.current.edges.find((edge) => edge.kind === "note_of" && edge.target === node.id);
    if (!noteEdge?.recordId) return;
    const overlay = noteEdge.source;
    const snapshot = modelRef.current;
    setBaasModel((prev) => (prev ? applyDemote(prev, overlay, node.id) : prev));
    const request = buildDemoteTxn({
      mount: edgesMount(),
      overlayResource: overlayTable(),
      edgesResource: edgesTable(),
      overlayId: parseNodeId(overlay).pk,
      edgeId: noteEdge.recordId,
    });
    commitTxn(request)
      .then((result) => { if (!txnApplied(result)) { setBaasModel(snapshot); setNotice("Couldn't remove the note."); } })
      .catch((error) => { setBaasModel(snapshot); setNotice(describeWriteError(error)); });
  };

  return (
    <div className="flex h-full min-h-0 w-full">
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden bg-[var(--osio-bg-page)]">
        <canvas ref={canvasRef} className="block h-full w-full touch-none" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="pointer-events-auto rounded-lg bg-black/40 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
            <span className="font-semibold text-white">Second Brain</span>
            <span className="ml-2">
              {model.stats.nodes.toLocaleString()}
              {totalNodes && totalNodes > model.stats.nodes ? ` of ${totalNodes.toLocaleString()}` : ""} nodes
            </span>
            <span className="ml-2">{model.stats.edges.toLocaleString()} edges</span>
            <span className="ml-2">{model.stats.databases} databases</span>
            {guarantee ? <span className="ml-2 text-white/50">· {guarantee}</span> : null}
            {offline ? <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200" title="Server unreachable — showing the last synced graph. Your edits are saved locally and sync automatically when it's back.">● offline · cached</span> : null}
          </div>
          <div className="pointer-events-auto flex items-center gap-1.5">
            <label className="flex items-center gap-1 rounded-lg bg-black/40 px-2 py-1 text-white/80 backdrop-blur">
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") runSearch(query); }}
                placeholder="Search nodes…"
                className="w-36 bg-transparent text-xs outline-none placeholder:text-white/40"
              />
            </label>
            <GraphButton label="Zoom in" onClick={() => sceneRef.current?.zoomBy(1.2)}><ZoomIn size={15} /></GraphButton>
            <GraphButton label="Zoom out" onClick={() => sceneRef.current?.zoomBy(0.83)}><ZoomOut size={15} /></GraphButton>
            <GraphButton label="Fit to view" onClick={() => sceneRef.current?.fit()}><Maximize2 size={15} /></GraphButton>
            <GraphButton label="Reset view" onClick={() => sceneRef.current?.resetView()}><LocateFixed size={15} /></GraphButton>
          </div>
        </div>

        <div className="absolute bottom-3 right-3">
          <Minimap scene={scene} />
        </div>

        <Legend model={model} hidden={hidden} onToggle={toggleDatabase} />

        {model.stats.nodes === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-4 py-3 text-center text-sm text-white/90 backdrop-blur">
              <span>{emptyStateMessage(baasMode, loading, loadError)}</span>
              {baasMode && loadError && !loading ? (
                <button type="button" onClick={retryLoad} className="rounded border border-white/25 px-3 py-1 text-xs transition-colors hover:bg-white/10">Retry</button>
              ) : null}
            </div>
          </div>
        ) : null}

        {notice ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
            <div className="pointer-events-auto max-w-[80%] truncate rounded-lg bg-black/75 px-3 py-1.5 text-xs text-white shadow-lg backdrop-blur">{notice}</div>
          </div>
        ) : null}
      </div>

      <aside className="w-72 shrink-0 overflow-auto border-l border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4 text-sm">
        {selectedNode ? (
          <NodeInspector
            node={selectedNode}
            properties={properties}
            consistency={baasMode ? "atomic" : null}
            onCommit={commitField}
            onPromote={promoteToNote}
            onDemote={demoteNote}
            promoteAvailable={baasMode}
          />
        ) : (
          <p className="text-[var(--osio-fg-muted)]">Select a node to inspect and edit its record. Notes are a separate color; data nodes are colored by database.</p>
        )}
      </aside>
    </div>
  );
};

const GraphButton: React.FC<{ label: string; onClick: () => void; children: React.ReactNode }> = ({ label, onClick, children }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className="rounded-lg bg-black/40 p-1.5 text-white/80 backdrop-blur transition-colors hover:bg-black/60 hover:text-white"
  >
    {children}
  </button>
);

const Legend: React.FC<{ model: GraphModel; hidden: ReadonlySet<string>; onToggle: (databaseId: string) => void }> = ({ model, hidden, onToggle }) => {
  const entries = [...model.byDatabase.entries()]
    .map(([databaseId, ids]) => ({ databaseId, count: ids.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  if (entries.length === 0) return null;
  return (
    <div className="absolute bottom-3 left-3 flex max-w-[55%] flex-wrap gap-1.5 rounded-lg bg-black/40 px-3 py-2 text-[11px] text-white/80 backdrop-blur">
      {entries.map((entry) => {
        const off = hidden.has(entry.databaseId);
        return (
          <button
            key={entry.databaseId}
            type="button"
            onClick={() => onToggle(entry.databaseId)}
            title={off ? "Show" : "Hide"}
            className={`flex items-center gap-1.5 rounded px-1 transition-opacity hover:bg-white/10 ${off ? "opacity-40 line-through" : ""}`}
          >
            <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: databaseColor(entry.databaseId) }} />
            {entry.databaseId} <span className="text-white/50">{entry.count}</span>
          </button>
        );
      })}
    </div>
  );
};

function localRecordProperties(nodeId: NodeId, databaseId: string | null, state: NotionState): InspectorProperty[] {
  if (!databaseId) return [];
  const prefix = `${GRAPH_SOURCE}:${databaseId}:`;
  const recordId = nodeId.startsWith(prefix) ? nodeId.slice(prefix.length) : nodeId;
  const page = state.pages[recordId];
  const database = state.databases[databaseId];
  if (!page || !database) return [];

  return Object.values(database.properties)
    .filter((property) => property.id !== database.titlePropertyId)
    .slice(0, 10)
    .map((property) => ({ key: property.id, label: property.name, value: formatValue(page.properties[property.id]) }))
    .filter((entry) => entry.value.length > 0);
}

/** Explain an empty graph (never a silent void): loading vs unreachable vs zero rows. */
function emptyStateMessage(baasMode: boolean, loading: boolean, loadError: string | null): string {
  if (!baasMode) return "No local data to graph — the database seed is empty.";
  if (loading) return "Connecting to the BaaS graph…";
  if (loadError) return `Couldn't load from the BaaS — ${loadError}. Is it running? (docker ps | grep kong)`;
  return "No nodes returned from the BaaS.";
}

/** Turn a write failure into an honest, user-facing message (409 vs 403 vs other). */
function describeWriteError(error: unknown): string {
  if (error instanceof BaasError) {
    if (error.isConflict) return `Conflict — ${error.message}`;
    if (error.status === 403) return "Not allowed — you don't own this record.";
    return `Save failed (${error.status}).`;
  }
  return "Save failed — couldn't reach the BaaS.";
}

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
