/**
 * Control state for the display console — the single source of truth the engine
 * and the React panels both bind to. Plain serializable data (arrays, not Sets)
 * so it round-trips through localStorage; the scene converts to Sets internally.
 */

import type { NodeKind } from "../types";
import { type LayoutParams, DEFAULT_LAYOUT_PARAMS } from "../layout/params";

export type BackgroundStyle = "aurora" | "aurora-calm" | "flat";

/** Filters & tag management. */
export interface FilterState {
  hiddenDatabases: string[];
  hiddenKinds: NodeKind[];
  /** Tag-hub labels the user has hidden. */
  hiddenTags: string[];
  /** Per-tag color overrides, keyed by tag label. */
  tagColors: Record<string, string>;
}

/** Visual sliders. */
export interface VisualState {
  /** Multiplies node radius (0.4..2.5). */
  nodeScale: number;
  /** Multiplies link thickness (0.3..3). */
  linkScale: number;
  /** Label density 0..1 (LOD threshold + budget). */
  labelDensity: number;
  /** Glow intensity 0..1.5. */
  glow: number;
  background: BackgroundStyle;
}

export interface SearchState {
  query: string;
}

export interface Controls {
  filter: FilterState;
  physics: LayoutParams;
  visual: VisualState;
  search: SearchState;
}

export const DEFAULT_CONTROLS: Controls = {
  filter: { hiddenDatabases: [], hiddenKinds: [], hiddenTags: [], tagColors: {} },
  physics: { ...DEFAULT_LAYOUT_PARAMS },
  visual: { nodeScale: 1, linkScale: 1, labelDensity: 0.5, glow: 1, background: "aurora-calm" },
  search: { query: "" },
};

/** Deep-ish clone so updates never mutate the previous snapshot. */
export function cloneControls(c: Controls): Controls {
  return {
    filter: {
      hiddenDatabases: [...c.filter.hiddenDatabases],
      hiddenKinds: [...c.filter.hiddenKinds],
      hiddenTags: [...c.filter.hiddenTags],
      tagColors: { ...c.filter.tagColors },
    },
    physics: { ...c.physics },
    visual: { ...c.visual },
    search: { ...c.search },
  };
}
