/**
 * GraphView — the canvas surface. Renders the stacked background + graph canvases
 * and binds them to a GraphEngine via `useGraphEngine`. Stateless about controls:
 * the host (or GraphExplorer) owns the Controls object and passes it in; selection
 * flows out through `onSelect`. Pair with `<GraphConsole>` for the control panels.
 */

import type { ReactElement, RefObject } from "react";
import type { GraphEngine } from "../core/engine";
import type { Controls } from "../core/state/controls";
import type { GraphModel, NodeId } from "../core/types";
import { useGraphEngine } from "./useGraphEngine";

export interface GraphViewProps {
  model: GraphModel;
  controls: Controls;
  selectedId?: NodeId | null;
  focusIds?: ReadonlySet<NodeId> | null;
  onSelect?: (id: NodeId | null) => void;
  onHover?: (id: NodeId | null) => void;
  onExpand?: (id: NodeId) => void;
  onReady?: (engine: GraphEngine) => void;
  className?: string;
}

const noop = (): void => {};

export function GraphView(props: GraphViewProps): ReactElement {
  const { containerRef, bgRef, fgRef } = useGraphEngine({
    model: props.model,
    controls: props.controls,
    selectedId: props.selectedId ?? null,
    focusIds: props.focusIds ?? null,
    onReady: props.onReady,
    callbacks: {
      onSelect: props.onSelect ?? noop,
      onHover: props.onHover ?? noop,
      onExpand: props.onExpand,
    },
  });

  return (
    <div ref={containerRef as RefObject<HTMLDivElement>} className={props.className ? `osio-graph ${props.className}` : "osio-graph"}>
      <canvas ref={bgRef as RefObject<HTMLCanvasElement>} className="osio-graph__bg" aria-hidden="true" />
      <canvas
        ref={fgRef as RefObject<HTMLCanvasElement>}
        className="osio-graph__fg"
        tabIndex={0}
        role="img"
        aria-label="Relationship graph"
      />
    </div>
  );
}
