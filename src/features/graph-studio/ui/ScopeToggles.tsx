import React from "react";

import { GRAPH_SCOPES, type GraphScope } from "../api/fetchBridgeGraph";

const SCOPE_LABELS: Record<GraphScope, string> = { workspace: "Workspace", all: "All pages", "all-data": "Everything" };

/** Which pages the graph reads: one choice of three, the chosen one pressed. */
interface Props {
  /** The scope that is read. */
  scope: GraphScope;
  /** The user picks a scope. */
  onPick: (scope: GraphScope) => void;
}

export const ScopeToggles: React.FC<Props> = ({ scope, onPick }) => (
  <div role="group" aria-label="Graph scope" className="flex gap-1">
    {GRAPH_SCOPES.map((option) => (
      <button
        key={option}
        type="button"
        aria-pressed={scope === option}
        onClick={() => onPick(option)}
        className={`rounded-xs px-1.5 py-0.5 transition-colors motion-reduce:transition-none ${scope === option ? "bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]" : "hover:bg-[var(--osio-bg-hover)]"}`}
      >
        {SCOPE_LABELS[option]}
      </button>
    ))}
  </div>
);
