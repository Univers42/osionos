/**
 * @osionos/graph-engine — public API.
 *
 * Decoupled force-graph engine with an aurora-glass look. The host app builds a
 * `GraphModel` and renders it through the React adapter; the engine never fetches
 * data itself. See README.md for the boundary contract.
 *
 * This barrel grows as phases land: data contract (now) → core engine → React
 * adapter (GraphView/GraphConsole) → export helpers.
 */

// Data contract
export type {
  NodeId,
  EdgeId,
  NodeKind,
  EdgeKind,
  GraphNode,
  GraphEdge,
  GraphModel,
  GraphStats,
  GraphPatch,
} from "./core/types";

// Model assembly + identity
export { indexModel, emptyModel, nodesEqual } from "./core/model/model";
export { makeRecordNodeId, makeNoteNodeId, makeTagNodeId, makeEdgeId } from "./core/model/ids";
export { applyDegreeWeights } from "./core/model/weights";

// Engine + control state
export { GraphEngine, type GraphEngineOptions, type EngineCallbacks, type MinimapData } from "./core/engine";
export {
  type Controls,
  type FilterState,
  type VisualState,
  type SearchState,
  type BackgroundStyle,
  DEFAULT_CONTROLS,
  cloneControls,
} from "./core/state/controls";
export { type LayoutParams, DEFAULT_LAYOUT_PARAMS } from "./core/layout/params";

// Model helpers for hosts that build a legend / focus themselves
export { deriveLegend, type Legend, type LegendEntry, type KindEntry } from "./core/model/legend";
export { neighborhood } from "./core/model/neighborhood";

// React adapter
export { GraphView, type GraphViewProps } from "./react/GraphView";
export { GraphExplorer, type GraphExplorerProps } from "./react/GraphExplorer";
export { Minimap } from "./react/Minimap";
export { GraphConsole, type GraphConsoleProps } from "./react/console/GraphConsole";
export { useGraphEngine, type UseGraphEngineArgs, type GraphEngineRefs } from "./react/useGraphEngine";
export { useControls, type UseControls } from "./react/useControls";
