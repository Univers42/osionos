/**
 * GraphExplorer — the batteries-included entry point: owns the Controls state
 * (persisted), tracks selection + focus neighborhood, derives the legend, and
 * composes <GraphView> + <GraphConsole>. The host just passes a GraphModel and
 * optional selection callbacks.
 */

import { type ReactElement, useCallback, useMemo, useState } from "react";
import type { GraphEngine } from "../core/engine";
import type { GraphModel, NodeId } from "../core/types";
import { deriveLegend } from "../core/model/legend";
import { neighborhood } from "../core/model/neighborhood";
import { GraphView } from "./GraphView";
import { GraphConsole } from "./console/GraphConsole";
import { useControls } from "./useControls";

export interface GraphExplorerProps {
  model: GraphModel;
  /** localStorage key for persisted controls (per host surface). */
  storageKey?: string;
  selectedId?: NodeId | null;
  onSelect?: (id: NodeId | null) => void;
  onHover?: (id: NodeId | null) => void;
  onExpand?: (id: NodeId) => void;
  className?: string;
}

export function GraphExplorer(props: GraphExplorerProps): ReactElement {
  const { controls, update, reset } = useControls(props.storageKey);
  const [engine, setEngine] = useState<GraphEngine | null>(null);
  const [internalSelected, setInternalSelected] = useState<NodeId | null>(null);
  const selectedId = props.selectedId !== undefined ? props.selectedId : internalSelected;

  const legend = useMemo(() => deriveLegend(props.model), [props.model]);
  const focusIds = useMemo(
    () => (selectedId ? neighborhood(props.model, selectedId, 1) : null),
    [props.model, selectedId],
  );

  const handleSelect = useCallback(
    (id: NodeId | null) => {
      setInternalSelected(id);
      props.onSelect?.(id);
    },
    [props],
  );

  return (
    <div className={props.className ? `osio-graph-explorer ${props.className}` : "osio-graph-explorer"}>
      <GraphView
        model={props.model}
        controls={controls}
        selectedId={selectedId}
        focusIds={focusIds}
        onSelect={handleSelect}
        onHover={props.onHover}
        onExpand={props.onExpand}
        onReady={setEngine}
      />
      <GraphConsole
        controls={controls}
        update={update}
        reset={reset}
        legend={legend}
        engine={engine}
        onSelect={handleSelect}
      />
    </div>
  );
}
