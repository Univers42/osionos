/**
 * React lifecycle glue for the imperative GraphEngine. Creates the engine once,
 * wires resize (ResizeObserver) + theme changes (MutationObserver on the document
 * root) + reduced-motion, and syncs model / controls / selection / focus through
 * effects. Returns the DOM refs to attach and the live engine ref.
 */

import { type RefObject, useEffect, useRef } from "react";
import { type EngineCallbacks, GraphEngine } from "../core/engine";
import type { Controls } from "../core/state/controls";
import type { GraphModel, NodeId } from "../core/types";

export interface UseGraphEngineArgs {
  model: GraphModel;
  controls: Controls;
  selectedId: NodeId | null;
  focusIds: ReadonlySet<NodeId> | null;
  callbacks: EngineCallbacks;
  onReady?: (engine: GraphEngine) => void;
}

export interface GraphEngineRefs {
  containerRef: RefObject<HTMLDivElement | null>;
  bgRef: RefObject<HTMLCanvasElement | null>;
  fgRef: RefObject<HTMLCanvasElement | null>;
  engineRef: RefObject<GraphEngine | null>;
}

export function useGraphEngine(args: UseGraphEngineArgs): GraphEngineRefs {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const fgRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GraphEngine | null>(null);
  const cbRef = useRef<EngineCallbacks>(args.callbacks);
  cbRef.current = args.callbacks;

  useEffect(() => {
    const container = containerRef.current;
    const bg = bgRef.current;
    const fg = fgRef.current;
    if (!container || !bg || !fg) return;
    const reduced =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const engine = new GraphEngine({
      graphCanvas: fg,
      bgCanvas: bg,
      themeRoot: document.documentElement,
      reducedMotion: reduced,
      callbacks: {
        onSelect: (id) => cbRef.current.onSelect(id),
        onHover: (id) => cbRef.current.onHover(id),
        onExpand: (id) => cbRef.current.onExpand?.(id),
      },
    });
    engineRef.current = engine;

    const applySize = (): void => {
      const rect = container.getBoundingClientRect();
      engine.setSize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    applySize();
    const resize = new ResizeObserver(applySize);
    resize.observe(container);
    const themeWatcher = new MutationObserver(() => engine.setTheme());
    themeWatcher.observe(document.documentElement, {
      attributes: true,
      // `data-palette` is load-bearing: the 8 colour palettes switch the --osio-graph-*
      // tokens through it (shared/config/theme.ts sets root.dataset.palette). Leaving it
      // out meant a palette change never re-resolved the theme — the graph kept the old
      // colours until a hard refresh remounted the engine.
      attributeFilter: ["data-theme", "data-palette", "class", "style"],
    });
    args.onReady?.(engine);

    return () => {
      resize.disconnect();
      themeWatcher.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
    // Mount once; updates flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setControls(args.controls);
  }, [args.controls]);

  useEffect(() => {
    engineRef.current?.setModel(args.model);
  }, [args.model]);

  useEffect(() => {
    engineRef.current?.setSelected(args.selectedId);
  }, [args.selectedId]);

  useEffect(() => {
    engineRef.current?.setFocus(args.focusIds);
  }, [args.focusIds]);

  return { containerRef, bgRef, fgRef, engineRef };
}
