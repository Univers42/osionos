/**
 * Display console shell: a collapsible, tabbed glass panel hosting the Filters,
 * Physics, Visual and Search/Export panels. Pure CSS for the collapse (no inline
 * styles, CSP-safe). Binds everything to the shared Controls object.
 */

import { type ReactElement, useState } from "react";
import type { GraphEngine } from "../../core/engine";
import type { Controls } from "../../core/state/controls";
import type { Legend } from "../../core/model/legend";
import type { NodeId } from "../../core/types";
import { FiltersPanel } from "./FiltersPanel";
import { PhysicsPanel } from "./PhysicsPanel";
import { VisualPanel } from "./VisualPanel";
import { SearchExportPanel } from "./SearchExportPanel";

type Tab = "filters" | "physics" | "visual" | "search";
const TABS: { id: Tab; label: string }[] = [
  { id: "filters", label: "Filters" },
  { id: "physics", label: "Physics" },
  { id: "visual", label: "Visual" },
  { id: "search", label: "Search" },
];

export interface GraphConsoleProps {
  controls: Controls;
  update: (mutate: (draft: Controls) => void) => void;
  reset: () => void;
  legend: Legend;
  engine: GraphEngine | null;
  onSelect?: (id: NodeId | null) => void;
  className?: string;
}

export function GraphConsole(props: GraphConsoleProps): ReactElement {
  const [tab, setTab] = useState<Tab>("filters");
  const [open, setOpen] = useState(true);

  return (
    <aside className={`osio-gc${open ? " is-open" : ""}${props.className ? ` ${props.className}` : ""}`}>
      <header className="osio-gc-bar">
        <button
          type="button"
          className="osio-gc-collapse"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="osio-gc-chevron" aria-hidden="true" />
          Graph console
        </button>
        {open && (
          <button type="button" className="osio-gc-reset" onClick={props.reset}>
            Reset
          </button>
        )}
      </header>

      {open && (
        <>
          <nav className="osio-gc-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`osio-gc-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="osio-gc-body">
            {tab === "filters" && <FiltersPanel controls={props.controls} legend={props.legend} update={props.update} />}
            {tab === "physics" && <PhysicsPanel controls={props.controls} update={props.update} engine={props.engine} />}
            {tab === "visual" && <VisualPanel controls={props.controls} update={props.update} />}
            {tab === "search" && (
              <SearchExportPanel
                controls={props.controls}
                update={props.update}
                engine={props.engine}
                onSelect={props.onSelect}
              />
            )}
          </div>
        </>
      )}
    </aside>
  );
}
