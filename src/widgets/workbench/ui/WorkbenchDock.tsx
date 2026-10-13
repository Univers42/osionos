/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WorkbenchDock.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Columns2, Plus, X } from "lucide-react";

import { useIdeDockStore } from "@/features/ide/model/ideDockStore";
import { useIdeSyncConflicts, conflictCount } from "@/features/ide/model/ideSyncConflicts";
import { IdeOutputPanel } from "@/features/ide/ui/IdeOutputPanel";
import { IdePortsPanel } from "@/features/ide/ui/IdePortsPanel";
import { IdeProblemsPanel } from "@/features/ide/ui/IdeProblemsPanel";
import { DOCK_TABS, clampDockHeight, type DockTab } from "@/widgets/workbench/model/workbenchLayout";
import { useWorkbenchStore } from "@/widgets/workbench/model/workbenchStore";

// Lazy so xterm.js (~250KB) loads only when the terminal first opens.
const IdeTerminal = React.lazy(() =>
  import("@/features/ide/ui/IdeTerminal").then((m) => ({ default: m.IdeTerminal })),
);

const TAB_LABEL: Record<DockTab, string> = {
  terminal: "Terminal",
  problems: "Problems",
  output: "Output",
  ports: "Ports",
};

const ICON_BTN =
  "flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-code-fg)]";

function nextTabIndex(key: string, index: number): number | null {
  const count = DOCK_TABS.length;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

const TerminalPane: React.FC = () => {
  const primary = useIdeDockStore((s) => s.primary);
  const secondary = useIdeDockStore((s) => s.secondary);
  return (
    <React.Suspense
      fallback={<div className="min-h-0 flex-1 px-3 py-2 font-mono text-[12px] text-[var(--osio-code-fg-muted)]">Starting terminal…</div>}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <IdeTerminal key={primary} termId={primary} />
      </div>
      {secondary && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-[var(--osio-code-border)]">
          <IdeTerminal key={secondary} termId={secondary} />
        </div>
      )}
    </React.Suspense>
  );
};

const TerminalActions: React.FC = () => {
  const secondary = useIdeDockStore((s) => s.secondary);
  const dock = useIdeDockStore.getState;
  const splitLabel = secondary ? "Close split" : "Split terminal";
  return (
    <>
      <button type="button" title="New terminal (fresh session)" aria-label="New terminal" onClick={() => dock().newTerminal()} className={ICON_BTN}>
        <Plus size={13} />
      </button>
      <button type="button" title={splitLabel} aria-label={splitLabel} onClick={() => (secondary ? dock().closeSecondary() : dock().splitTerminal())} className={ICON_BTN}>
        <Columns2 size={13} />
      </button>
    </>
  );
};

const DockTabs: React.FC<{ active: DockTab; conflicts: number }> = ({ active, conflicts }) => {
  const setTab = useWorkbenchStore((s) => s.setDockTab);
  const tabRefs = React.useRef<Partial<Record<DockTab, HTMLButtonElement | null>>>({});

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const next = nextTabIndex(e.key, index);
    const target = next === null ? undefined : DOCK_TABS[next];
    if (!target) return;
    e.preventDefault();
    setTab(target);
    tabRefs.current[target]?.focus();
  };

  return (
    <div role="tablist" aria-label="Panel tabs" className="flex items-center gap-1">
      {DOCK_TABS.map((id, index) => (
        <button
          key={id}
          ref={(el) => { tabRefs.current[id] = el; }}
          type="button"
          role="tab"
          id={`dock-tab-${id}`}
          aria-selected={active === id}
          aria-controls={active === id ? `dock-panel-${id}` : undefined}
          tabIndex={active === id ? 0 : -1}
          data-dock-tab={id}
          onClick={() => setTab(id)}
          onKeyDown={(e) => onKeyDown(e, index)}
          className={`rounded px-2 py-1 hover:text-[var(--osio-code-fg)] ${
            active === id ? "text-[var(--osio-code-fg)] underline decoration-[var(--osio-accent)] underline-offset-4" : ""
          }`}
        >
          {TAB_LABEL[id]}
          {id === "output" && conflicts > 0 && (
            <span className="ml-1 rounded bg-[var(--osio-warning)] px-1 text-[10px] text-[var(--osio-warning-fg)]">{conflicts}</span>
          )}
        </button>
      ))}
    </div>
  );
};

/** Bottom dock: Terminal / Problems / Output / Ports. The terminal stays MOUNTED
 *  (hidden) on other tabs so its PTY socket and scrollback survive. */
export const WorkbenchDock: React.FC = () => {
  const active = useWorkbenchStore((s) => s.dockTab);
  const closeDock = useWorkbenchStore((s) => s.closeDock);
  const height = useWorkbenchStore((s) => s.dockHeight);
  const conflicts = useIdeSyncConflicts((s) => conflictCount(s.byPageId));

  return (
    <section
      aria-label="Panel"
      data-testid="workbench-dock"
      data-code-theme="dark"
      style={{ height: clampDockHeight(height, globalThis.innerHeight), minHeight: "var(--osio-dock-min-h)" }}
      className="flex shrink-0 flex-col bg-[var(--osio-code-bg)]"
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--osio-code-border)] px-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--osio-code-fg-muted)]">
        <DockTabs active={active} conflicts={conflicts} />
        <span className="flex-1" />
        {active === "terminal" && <TerminalActions />}
        <button type="button" title="Hide panel" aria-label="Hide panel" onClick={closeDock} className={ICON_BTN}>
          <X size={13} />
        </button>
      </div>
      <div
        role="tabpanel"
        id="dock-panel-terminal"
        aria-labelledby="dock-tab-terminal"
        hidden={active !== "terminal"}
        className={active === "terminal" ? "flex min-h-0 flex-1" : "hidden"}
      >
        <TerminalPane />
      </div>
      {active !== "terminal" && (
        <div role="tabpanel" id={`dock-panel-${active}`} aria-labelledby={`dock-tab-${active}`} className="flex min-h-0 flex-1 flex-col">
          {active === "problems" && <IdeProblemsPanel />}
          {active === "output" && <IdeOutputPanel />}
          {active === "ports" && <IdePortsPanel />}
        </div>
      )}
    </section>
  );
};
