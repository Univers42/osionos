/**
 * Search / focus / export panel: type to find + focus a node (its neighborhood
 * stays lit, the rest dims), fit-to-screen / reset-view, and export the current
 * view as PNG (rasterized aurora + graph) or SVG (vector).
 */

import type { ReactElement } from "react";
import type { GraphEngine } from "../../core/engine";
import type { Controls } from "../../core/state/controls";
import type { NodeId } from "../../core/types";

export interface SearchExportPanelProps {
  controls: Controls;
  update: (mutate: (draft: Controls) => void) => void;
  engine: GraphEngine | null;
  onSelect?: (id: NodeId | null) => void;
}

export function SearchExportPanel({ controls, update, engine, onSelect }: SearchExportPanelProps): ReactElement {
  const onSearch = (query: string): void => {
    update((draft) => {
      draft.search.query = query;
    });
    const match = engine?.search(query) ?? null;
    if (query.trim() && match) onSelect?.(match);
  };

  return (
    <div className="osio-gc-panel">
      <input
        className="osio-gc-search"
        type="search"
        placeholder="Search nodes…"
        aria-label="Search nodes"
        value={controls.search.query}
        onChange={(e) => onSearch(e.currentTarget.value)}
      />
      <div className="osio-gc-row">
        <button type="button" className="osio-gc-btn" onClick={() => engine?.fit()}>
          Fit
        </button>
        <button type="button" className="osio-gc-btn" onClick={() => engine?.resetView()}>
          Reset view
        </button>
      </div>
      <div className="osio-gc-row">
        <button type="button" className="osio-gc-btn" onClick={() => engine && download("graph.png", engine.exportPng())}>
          Export PNG
        </button>
        <button
          type="button"
          className="osio-gc-btn"
          onClick={() => engine && download("graph.svg", svgUrl(engine.exportSvg()))}
        >
          Export SVG
        </button>
      </div>
    </div>
  );
}

function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function download(filename: string, href: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
