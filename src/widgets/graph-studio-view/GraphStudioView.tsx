/**
 * The second brain's graph, drawn by graph_render's `<graph-studio>` element with the
 * bridge's data. The element is created and connected once per mount and never moved:
 * it reads its attributes only when it connects, and a DOM move tears its motor down.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useToastStore } from "@osionos/ui/primitives/useToastStore";

import type { PageEntry } from "@/entities/page";
import { useUserStore } from "@/features/auth";
import {
  type Dropped,
  type GraphScope,
  GRAPH_SCOPES,
  GRAPH_STUDIO_TAG,
  HOST_API,
  fetchBridgeGraph,
  loadGraphScope,
  loadStudio,
  pageIdOf,
  recordRefOf,
  saveGraphScope,
  takeGraphFocus,
  toIngestDoc,
} from "@/features/graph-studio";
import { api, getActivePageJwt } from "@/shared/api/client";
import { usePageStore } from "@/store/usePageStore";
// Deep path, not the barrel: the database view's barrel has side effects this view does not need.
import { openNotePage, openRecordNote } from "@/widgets/database-view/model/recordSubItems";

interface LoadResult {
  readonly nodes: number;
  readonly edges: number;
  readonly notes: readonly string[];
}

/** The part of the element's host API (version 2) this view uses. */
interface StudioElement extends HTMLElement {
  readonly hostApi: unknown;
  loadGraph(doc: object): Promise<LoadResult>;
  focusNode(id: string): Promise<boolean>;
}

type ViewState =
  | { phase: "loading" }
  | { phase: "unavailable"; message: string }
  | { phase: "error"; message: string }
  | { phase: "ready"; nodes: number; edges: number; dropped: Dropped; signedIn: boolean };

interface LoadBook {
  /** Bumped per load, so an older load that settles late changes nothing. */
  token: number;
  inFlight: number;
  /** A refusal our own load already showed, so its `graph-error` twin is not reported again. */
  refused: string | null;
  /** A `graph-error` seen while our load was in flight. */
  seen: string | null;
}

const SCOPE_LABELS: Record<GraphScope, string> = { workspace: "Workspace", all: "All pages", "all-data": "Everything" };
const EMPTY_DOC = { version: 1, nodes: [], edges: [] };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchPage(pageId: string): Promise<PageEntry | null> {
  try {
    return (await api.get<PageEntry>(`/api/pages/${encodeURIComponent(pageId)}`, getActivePageJwt() ?? undefined)) ?? null;
  } catch {
    return null;
  }
}

/** The page behind a node: a page itself, or the note the bridge keeps for a record. */
async function nodePage(nodeId: string): Promise<PageEntry | null | undefined> {
  const pageId = pageIdOf(nodeId);
  if (pageId) return usePageStore.getState().pageById(pageId) ?? (await fetchPage(pageId));
  const record = recordRefOf(nodeId);
  return record ? openRecordNote(record) : undefined;
}

/**
 * A page node opens its page in a tab, and a record node its note (made on first open, as
 * the legacy graph did). Either may come from the bridge without being in the page store,
 * so it opens through openNotePage, which adds it to the store first; a tab whose page the
 * store lacks would stay on the Loading pane.
 */
async function openGraphNode(nodeId: string): Promise<void> {
  const toast = useToastStore.getState().push;
  const page = await nodePage(nodeId);
  if (page === undefined) {
    toast({ kind: "info", title: "Only pages and records open from the graph" });
    return;
  }
  if (!page) {
    toast({ kind: "error", title: "That page could not be opened" });
    return;
  }
  openNotePage(page);
}

function droppedTotal(dropped: Dropped): number {
  return dropped.dupNodes + dropped.dupEdges + dropped.dangling;
}

/** The words shown over the canvas, or null when the graph speaks for itself. Never a blank box. */
function overlayText(view: ViewState): string | null {
  switch (view.phase) {
    case "loading":
      return "Loading the graph…";
    case "unavailable":
      return `Graph unavailable: ${view.message}`;
    case "error":
      return `The graph could not load: ${view.message}`;
    case "ready":
      if (view.nodes > 0) return null;
      if (!view.signedIn) return "Sign in to see your pages in the graph.";
      if (droppedTotal(view.dropped) > 0) return `${droppedTotal(view.dropped)} item(s) dropped, 0 shown.`;
      return "Nothing to show in this scope yet.";
  }
}

interface GraphStudioViewProps {
  /** A fixed scope (the graph_view block); without it the view uses and saves the user's choice. */
  scope?: GraphScope;
}

export const GraphStudioView: React.FC<GraphStudioViewProps> = ({ scope: fixedScope }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const book = useRef<LoadBook>({ token: 0, inFlight: 0, refused: null, seen: null });
  const [element, setElement] = useState<StudioElement | null>(null);
  const [view, setView] = useState<ViewState>({ phase: "loading" });
  const [chosenScope, setChosenScope] = useState<GraphScope>(loadGraphScope);
  const [attempt, setAttempt] = useState(0);
  const workspaceId = useUserStore((s) => s.activeWorkspace()?._id ?? "");
  const scope = fixedScope ?? chosenScope;

  // Create, configure, then connect: `wasm` set after connect would be ignored.
  useEffect(() => {
    let disposed = false;
    let connected: StudioElement | null = null;
    loadStudio().then(
      (pack) => {
        const host = hostRef.current;
        if (disposed || !host) return;
        const el = document.createElement(GRAPH_STUDIO_TAG) as StudioElement;
        el.setAttribute("wasm", `${pack.base}graph_wasm.wasm`);
        el.setAttribute("fixtures", `${pack.base}fixtures/`);
        // Pinned to the host, not sized by percentages: a graph_view block's host has only
        // a min-height, so height:100% would resolve to 0 there.
        el.style.cssText = "display:block;position:absolute;inset:0";
        host.appendChild(el);
        if (el.hostApi !== HOST_API) {
          el.remove();
          setView({ phase: "unavailable", message: `the element speaks host API ${String(el.hostApi)}, this app needs ${HOST_API}` });
          return;
        }
        connected = el;
        setElement(el);
      },
      (error: unknown) => {
        if (!disposed) setView({ phase: "unavailable", message: messageOf(error) });
      },
    );
    return () => {
      disposed = true;
      connected?.remove();
    };
  }, []);

  useEffect(() => {
    if (!element) return;
    const onOpen = (event: Event) => {
      void openGraphNode((event as CustomEvent<{ id: string }>).detail.id);
    };
    const onError = (event: Event) => {
      const { error, message } = (event as CustomEvent<{ error: string; message: string }>).detail;
      if (book.current.inFlight > 0) {
        book.current.seen = message;
        return;
      }
      if (message === book.current.refused) {
        book.current.refused = null;
        return;
      }
      console.warn("[graph-studio] graph-error", { error, message });
    };
    element.addEventListener("node-open", onOpen);
    element.addEventListener("graph-error", onError);
    return () => {
      element.removeEventListener("node-open", onOpen);
      element.removeEventListener("graph-error", onError);
    };
  }, [element]);

  useEffect(() => {
    if (!element) return;
    const ledger = book.current;
    const token = ++ledger.token;
    const live = () => token === ledger.token;
    void (async () => {
      let graph: Awaited<ReturnType<typeof fetchBridgeGraph>>;
      try {
        graph = await fetchBridgeGraph(scope, workspaceId);
      } catch (error) {
        if (live()) setView({ phase: "error", message: `the bridge did not answer (${messageOf(error)})` });
        return;
      }
      if (!live()) return;
      const { doc, dropped } = graph === null ? { doc: EMPTY_DOC, dropped: { dupNodes: 0, dupEdges: 0, dangling: 0 } } : toIngestDoc(graph);
      if (droppedTotal(dropped) > 0) {
        console.info(`[graph-studio] dropped ${dropped.dupNodes} duplicate node(s), ${dropped.dupEdges} duplicate edge(s), ${dropped.dangling} dangling edge(s)`);
      }
      // A refusal's twin graph-error from an earlier load is no longer expected.
      ledger.refused = null;
      ledger.inFlight += 1;
      let refusal: string | null = null;
      try {
        const result = await element.loadGraph(doc);
        if (import.meta.env.DEV && result.notes.length > 0) {
          console.error("[graph-studio] the element filled in our document", result.notes);
        }
        if (!live()) return;
        setView({ phase: "ready", nodes: result.nodes, edges: result.edges, dropped, signedIn: graph !== null });
        // Only the Home graph takes a focus request; a graph_view block in a page never does.
        const focus = fixedScope ? null : takeGraphFocus();
        if (focus && !(await element.focusNode(focus))) {
          useToastStore.getState().push({ kind: "info", title: "That page is not in this graph's scope" });
        }
      } catch (error) {
        refusal = messageOf(error);
        if (live()) setView({ phase: "error", message: refusal });
      } finally {
        ledger.inFlight -= 1;
        const seen = ledger.seen;
        ledger.seen = null;
        // The element fires graph-error for a refused load as well as rejecting, in either
        // order: the overlay reports it, so its twin is swallowed whichever comes second.
        if (refusal === null && seen !== null) console.warn("[graph-studio] graph-error", { message: seen });
        else if (refusal !== null && seen !== refusal && live()) ledger.refused = refusal;
      }
    })();
    // Unmounted or superseded: a load still in flight must not touch the view or take a focus.
    return () => {
      ledger.token += 1;
    };
  }, [element, scope, workspaceId, attempt, fixedScope]);

  const pickScope = useCallback((next: GraphScope) => {
    saveGraphScope(next);
    setChosenScope(next);
    setView({ phase: "loading" });
  }, []);

  const retry = useCallback(() => {
    setView({ phase: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const overlay = overlayText(view);
  return (
    <div
      data-testid="graph-studio-view"
      data-graph-state={view.phase}
      className="relative flex h-full min-h-[inherit] w-full flex-col overflow-hidden"
    >
      {fixedScope ? null : (
        <div className="flex items-center gap-2 border-b border-[var(--osio-border-default)] px-3 py-1.5 text-xs text-[var(--osio-fg-muted)]">
          <div role="group" aria-label="Graph scope" className="flex gap-1">
            {GRAPH_SCOPES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={scope === option}
                onClick={() => pickScope(option)}
                className={`rounded px-1.5 py-0.5 transition-colors ${scope === option ? "bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]" : "hover:bg-[var(--osio-bg-hover)]"}`}
              >
                {SCOPE_LABELS[option]}
              </button>
            ))}
          </div>
          {view.phase === "ready" ? (
            <span>
              {view.nodes} nodes · {view.edges} links
              {droppedTotal(view.dropped) > 0 ? ` · ${droppedTotal(view.dropped)} dropped` : ""}
            </span>
          ) : null}
        </div>
      )}
      <div ref={hostRef} className="relative min-h-[200px] flex-1" />
      {overlay === null ? null : (
        <div
          role={view.phase === "unavailable" || view.phase === "error" ? "alert" : "status"}
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-[var(--osio-fg-muted)]"
        >
          <span>{overlay}</span>
          {view.phase === "error" ? (
            <button
              type="button"
              onClick={retry}
              className="pointer-events-auto rounded border border-[var(--osio-border-default)] px-2 py-0.5 text-xs hover:bg-[var(--osio-bg-hover)]"
            >
              Retry
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
};
