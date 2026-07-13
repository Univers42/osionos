/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MermaidDiagram.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:26:44 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minus, Plus, X } from "lucide-react";

interface MermaidDiagramProps {
  chart: string;
  className?: string;
  /** Follows the code card's dark/light so the diagram matches its surface. */
  codeTheme?: "dark" | "light";
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 12;
const ZOOM_STEP = 1.25;
const WHEEL_STEP = 1.1;
const clampZoom = (n: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(n * 100) / 100));

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
function loadMermaid() {
  mermaidPromise ??= import("mermaid").then((module) => module.default);
  return mermaidPromise;
}

function nextRenderId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `osionos-mermaid-${crypto.randomUUID()}`;
  }
  return `osionos-mermaid-${Date.now().toString(36)}`;
}

/** Remove an orphan SVG/iframe mermaid may inject into <body> before throwing. */
function cleanupMermaidOrphans(renderId: string) {
  const orphan = document.getElementById(renderId);
  if (orphan && !orphan.closest(".mermaid-diagram")) orphan.remove();
  const dOrphan = document.getElementById(`d${renderId}`);
  if (dOrphan && !dOrphan.closest(".mermaid-diagram")) dOrphan.remove();
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({
  chart,
  className,
  codeTheme = "dark",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const renderTokenRef = useRef(0);
  const lastRenderIdRef = useRef<string | null>(null);

  const [rendered, setRendered] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  // Inline pane height is user-resizable: a big diagram needs a taller viewport,
  // and the old fixed max-h-[74vh] made dragging to extend "just stop".
  const [paneHeight, setPaneHeight] = useState(500);
  const resizeRef = useRef<{ y: number; h: number } | null>(null);

  // Refs mirror zoom/offset so the native wheel listener reads live values.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  // Fit the WHOLE diagram in the frame, centered — visible immediately, no
  // hunting. The SVG renders at natural size, so we fit-to-contain: a large
  // diagram shrinks to fit; a SMALL one grows to FILL the pane (this is the fix
  // for "a small diagram needs 800% zoom to read it" — no artificial 2× cap; the
  // only ceiling is MAX_ZOOM via clampZoom). Centering is free: container
  // flex-center + offset 0. The resize grip grows the pane and re-fits.
  const fitToView = useCallback(() => {
    const frame = frameRef.current;
    const svg = containerRef.current?.querySelector("svg");
    setOffset({ x: 0, y: 0 });
    if (!frame || !svg) {
      setZoom(1);
      return;
    }
    const fr = frame.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    const z = zoomRef.current || 1;
    const naturalW = sr.width / z;
    const naturalH = sr.height / z;
    const pad = 16;
    const fit =
      naturalW > 0 && naturalH > 0
        ? Math.min((fr.width - pad) / naturalW, (fr.height - pad) / naturalH)
        : 1;
    setZoom(clampZoom(fit));
  }, []);

  // Render mermaid whenever the source, the card theme, or the mount node
  // (inline <-> fullscreen portal) changes — the SVG is injected imperatively,
  // so a re-parent needs a fresh render into the new node.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Non-null declared type so the narrowing survives the async closure below.
    const target = container;

    const source = chart.trim();
    if (!source) {
      target.innerHTML = "";
      setRendered(false);
      return;
    }

    const currentToken = ++renderTokenRef.current;
    let cancelled = false;
    const renderId = nextRenderId();
    lastRenderIdRef.current = renderId;
    target.innerHTML = "";

    async function renderDiagram() {
      try {
        const mermaid = await loadMermaid();
        // Re-init each render: mermaid's config is global, so this is the
        // documented way to follow the card's dark/light theme live.
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: codeTheme === "light" ? "neutral" : "dark",
        });

        // Fonts must load before mermaid measures labels, else 0/NaN widths ->
        // dagre lays every node at NaN coordinates.
        if (typeof document !== "undefined" && document.fonts) {
          await document.fonts.ready;
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (cancelled || renderTokenRef.current !== currentToken) return;

        const parsed = await mermaid.parse(source, { suppressErrors: true });
        if (cancelled || renderTokenRef.current !== currentToken) return;
        if (!parsed) {
          showSource(target, source);
          setRendered(false);
          return;
        }

        const { svg, bindFunctions } = await mermaid.render(renderId, source, target);
        if (cancelled || renderTokenRef.current !== currentToken) {
          cleanupMermaidOrphans(renderId);
          return;
        }
        if (/translate\(\s*undefined|[\s(,]NaN/.test(svg)) {
          throw new Error("mermaid layout produced NaN coordinates");
        }
        target.innerHTML = svg;
        bindFunctions?.(target);
        // Render at NATURAL size. Forcing width:100% squeezed a large diagram into
        // the narrow pane until it was unreadable (needing ~600% zoom just to make
        // out a node). At natural size it stays legible and simply overflows the
        // pane — pan, zoom, and the resize grip navigate it instead.
        const svgEl = target.querySelector("svg");
        if (svgEl) {
          svgEl.removeAttribute("height");
          svgEl.style.maxWidth = "none";
          svgEl.style.height = "auto";
        }
        setRendered(true);
        // Center + fit the whole diagram once layout settles (next frame).
        requestAnimationFrame(() => {
          if (cancelled || renderTokenRef.current !== currentToken) return;
          fitToView();
        });
      } catch {
        cleanupMermaidOrphans(renderId);
        if (cancelled || renderTokenRef.current !== currentToken) return;
        showSource(target, source);
        setRendered(false);
      }
    }

    // dagre emits NaN coordinates when the container has no width yet
    // (collapsed/off-screen/first paint) — render once it is actually sized,
    // and retry via ResizeObserver if it starts at zero width.
    let observer: ResizeObserver | null = null;
    const renderWhenSized = () => {
      if (cancelled || renderTokenRef.current !== currentToken) return;
      if (!target.isConnected || target.offsetWidth === 0) return;
      observer?.disconnect();
      observer = null;
      renderDiagram().catch((error: unknown) => {
        console.error("[MermaidDiagram] Failed to render diagram", error);
      });
    };

    if (target.offsetWidth > 0) {
      renderWhenSized();
    } else if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(renderWhenSized);
      observer.observe(target);
    } else {
      renderWhenSized();
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (lastRenderIdRef.current) cleanupMermaidOrphans(lastRenderIdRef.current);
    };
  }, [chart, codeTheme, fullscreen, fitToView]);

  // Esc + body-scroll lock while fullscreen (same pattern as ImageFullscreen).
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setFullscreen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  // Scroll-to-zoom, anchored at the cursor. Native non-passive listener so
  // preventDefault can stop the page scroll — but only when the zoom actually
  // changes, so at the min/max limits the page keeps scrolling normally.
  // ponytail: plain wheel zooms; add a Ctrl-gate here if it fights page scroll.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const prev = zoomRef.current;
      const next = clampZoom(prev * (event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP));
      if (next === prev) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = event.clientX - rect.left - rect.width / 2;
      const cy = event.clientY - rect.top - rect.height / 2;
      const o = offsetRef.current;
      const ratio = next / prev;
      setOffset({ x: cx - (cx - o.x) * ratio, y: cy - (cy - o.y) * ratio });
      setZoom(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fullscreen]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!rendered) return;
      if ((event.target as HTMLElement).closest("button")) return;
      dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [rendered, offset],
  );
  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset({ x: d.ox + (event.clientX - d.x), y: d.oy + (event.clientY - d.y) });
  }, []);
  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  // Drag the bottom grip to grow/shrink the inline viewport. Growing it re-fits
  // the diagram to the taller pane (fitToView), so "extend it down" makes the
  // diagram bigger and readable instead of hitting a height cap.
  const onResizeStart = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { y: event.clientY, h: frameRef.current?.getBoundingClientRect().height ?? paneHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [paneHeight]);
  const onResizeMove = useCallback((event: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    setPaneHeight(Math.max(200, r.h + (event.clientY - r.y)));
  }, []);
  const onResizeEnd = useCallback(() => {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    requestAnimationFrame(() => fitToView());
  }, [fitToView]);

  const btn =
    "inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--osio-code-fg-muted)] transition-colors hover:bg-[var(--osio-code-btn-hover)] hover:text-[var(--osio-code-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/40 disabled:cursor-not-allowed disabled:opacity-40";

  const frame = (
    <div
      ref={frameRef}
      className={[
        "group/mermaid relative isolate flex items-center justify-center overflow-hidden bg-[var(--osio-code-bg)]",
        fullscreen ? "h-full" : "",
        rendered ? (dragging ? "cursor-grabbing" : "cursor-grab touch-none") : "",
      ].join(" ")}
      style={fullscreen ? undefined : { height: paneHeight, minHeight: 200 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* Full-width block target — a shrinking flex child collapses to 0 width
          and mermaid never renders (dagre needs a sized box). */}
      <div
        className="w-full p-4 will-change-transform"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transition: dragging ? "none" : "transform 150ms ease-out",
        }}
      >
        <div
          ref={containerRef}
          className="mermaid-diagram flex w-full items-center justify-center [&_svg]:h-auto"
        />
      </div>

      {rendered && (
        <>
          <button
            type="button"
            aria-label={fullscreen ? "Exit full screen" : "Full screen diagram"}
            title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
            onClick={() => setFullscreen((v) => !v)}
            className={[
              btn,
              "absolute right-2 top-2 border border-[var(--osio-code-border)] bg-[var(--osio-code-header-bg)]",
              fullscreen
                ? ""
                : "opacity-0 group-hover/mermaid:opacity-100 focus-visible:opacity-100 motion-reduce:opacity-100",
            ].join(" ")}
          >
            {fullscreen ? <X size={14} /> : <Maximize2 size={14} />}
          </button>

          <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-lg border border-[var(--osio-code-border)] bg-[var(--osio-code-header-bg)] p-0.5 shadow-sm">
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              disabled={zoom <= MIN_ZOOM}
              onClick={() => setZoom((z) => clampZoom(z / ZOOM_STEP))}
              className={btn}
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              aria-label="Fit diagram to view"
              title="Fit to view"
              onClick={fitToView}
              className="h-7 min-w-[3rem] rounded-md px-1 font-mono text-[11px] tabular-nums text-[var(--osio-code-fg-muted)] transition-colors hover:bg-[var(--osio-code-btn-hover)] hover:text-[var(--osio-code-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]/40"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => setZoom((z) => clampZoom(z * ZOOM_STEP))}
              className={btn}
            >
              <Plus size={14} />
            </button>
          </div>
        </>
      )}

      {!fullscreen && (
        <div
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          className="absolute bottom-0 left-1/2 z-10 flex h-3 w-24 -translate-x-1/2 cursor-ns-resize touch-none items-end justify-center pb-0.5"
          title="Drag to resize"
          aria-hidden="true"
        >
          <span className="h-1 w-10 rounded-full bg-[var(--osio-code-fg-muted)] opacity-40 transition-opacity group-hover/mermaid:opacity-70" />
        </div>
      )}
    </div>
  );

  if (fullscreen) {
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Diagram full screen"
        className="fixed inset-0 z-[10050] flex flex-col bg-[var(--osio-overlay)] p-4 motion-reduce:transition-none"
        data-code-theme={codeTheme}
      >
        <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--osio-radius-lg)] border border-[var(--osio-code-border)] shadow-2xl">
          {frame}
        </div>
      </div>,
      document.body,
    );
  }

  return <div className={className}>{frame}</div>;
};

/** Fallback: show the raw source (invalid/incomplete diagram) as monospaced text. */
function showSource(target: HTMLElement, source: string) {
  target.innerHTML = "";
  const pre = document.createElement("pre");
  pre.className =
    "text-xs leading-relaxed font-mono text-[var(--osio-fg-subtle)] whitespace-pre-wrap";
  pre.textContent = source;
  target.appendChild(pre);
}
