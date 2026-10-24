import React, { useCallback, useState } from "react";

import { EDGE_KINDS, EDGE_KIND_LABELS, type EdgeKind, loadEdgeKinds, saveEdgeKinds, toggleEdgeKind } from "../model/edgeKinds";

/**
 * The kinds of edge the graph shows.
 *
 * A VIEW choice: the store keeps every edge, and the user hides the kinds
 * they do not care about. The toggles are the feature's own — the view only
 * says which kinds are on.
 */
interface Props {
  /** The kinds that are shown. */
  kinds: readonly EdgeKind[];
  /** The user picks a kind. */
  onPick: (kind: EdgeKind) => void;
}

export const EdgeKindToggles: React.FC<Props> = ({ kinds, onPick }) => (
  <div role="group" aria-label="Edge kinds" className="flex gap-1">
    {EDGE_KINDS.map((kind) => (
      <button
        key={kind}
        type="button"
        aria-pressed={kinds.includes(kind)}
        onClick={() => onPick(kind)}
        className={`rounded-xs px-1.5 py-0.5 transition-colors motion-reduce:transition-none ${kinds.includes(kind) ? "bg-[var(--osio-bg-muted)] text-[var(--osio-fg-default)]" : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)]"}`}
      >
        {EDGE_KIND_LABELS[kind]}
      </button>
    ))}
  </div>
);

/** The kinds the user chose, remembered across visits, and the pick that changes them. */
export function useEdgeKinds(): [EdgeKind[], (kind: EdgeKind) => void] {
  const [kinds, setKinds] = useState<EdgeKind[]>(loadEdgeKinds);
  const pick = useCallback(
    (kind: EdgeKind) => {
      const next = toggleEdgeKind(kinds, kind);
      saveEdgeKinds(next);
      setKinds(next);
    },
    [kinds],
  );
  return [kinds, pick];
}
