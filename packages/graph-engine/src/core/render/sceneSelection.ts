/**
 * Tracks the selected node + the focus neighborhood as stable node IDS, plus the
 * resolved buffer INDICES the renderer reads. IDs survive graph rebuilds (indices
 * don't), so `recompute` re-resolves indices whenever the model changes. No DOM —
 * the CanvasScene façade owns the redraw.
 */

import type { NodeId } from "../types";

export class SceneSelection {
  selectedId: NodeId | null = null;
  selectedIndex = -1;
  focusIndices: Set<number> | null = null;
  private focusNodeIds: ReadonlySet<NodeId> | null = null;

  setSelected(id: NodeId | null, idToIndex: Map<NodeId, number>): void {
    this.selectedId = id;
    this.selectedIndex = id == null ? -1 : idToIndex.get(id) ?? -1;
  }

  setFocus(ids: ReadonlySet<NodeId> | null, idToIndex: Map<NodeId, number>): void {
    this.focusNodeIds = ids;
    this.recompute(idToIndex);
  }

  /** Re-resolve indices from the stable IDs (call after a graph rebuild). */
  recompute(idToIndex: Map<NodeId, number>): void {
    this.selectedIndex = this.selectedId == null ? -1 : idToIndex.get(this.selectedId) ?? -1;
    if (!this.focusNodeIds) {
      this.focusIndices = null;
      return;
    }
    const set = new Set<number>();
    for (const id of this.focusNodeIds) {
      const index = idToIndex.get(id);
      if (index !== undefined) set.add(index);
    }
    this.focusIndices = set;
  }
}
