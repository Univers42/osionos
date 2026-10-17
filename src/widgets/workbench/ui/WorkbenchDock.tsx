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
import { Columns2, Plus, ShieldCheck, Trash2, X } from "lucide-react";

import { Tooltip } from "@/shared/ui";
import { useIdeDockStore } from "@/features/ide/model/ideDockStore";
import { useIdeOutputBus } from "@/features/ide/model/ideOutputBus";
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

// Lazy like the terminal: the debug panel pulls the DAP controller chunk.
const DebugPanel = React.lazy(() =>
  import("@/features/ide/ui/DebugPanel").then((m) => ({ default: m.DebugPanel })),
);

const TAB_LABEL: Record<DockTab, string> = {
  terminal: "Terminal",
  problems: "Problems",
  output: "Output",
  debug: "Debug",
  ports: "Ports",
};

// 24px is the smallest target WCAG 2.2 allows; the glyph stays small inside it.
const ICON_BTN = "osio-code-btn h-6 w-6 shrink-0";

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
  const safeTerms = useIdeDockStore((s) => s.safeTerms);
  return (
    <React.Suspense
      fallback={<div className="min-h-0 flex-1 px-3 py-2 font-mono text-xs text-[var(--osio-code-fg-muted)]">Starting terminal…</div>}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <IdeTerminal key={primary} termId={primary} safe={safeTerms.includes(primary)} />
      </div>
      {secondary && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-l border-[var(--osio-code-border)]">
          <IdeTerminal key={secondary} termId={secondary} safe={safeTerms.includes(secondary)} />
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
      <Tooltip label="New terminal (fresh session)" side="bottom">
        <button type="button" aria-label="New terminal" onClick={() => dock().newTerminal()} className={ICON_BTN}>
          <Plus size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Safe terminal (no ~/.bashrc or ~/.profile)" side="bottom">
        <button type="button" aria-label="Safe terminal" onClick={() => dock().newSafeTerminal()} className={ICON_BTN}>
          <ShieldCheck size={14} />
        </button>
      </Tooltip>
      <Tooltip label={splitLabel} side="bottom">
        <button type="button" aria-label={splitLabel} onClick={() => (secondary ? dock().closeSecondary() : dock().splitTerminal())} className={ICON_BTN}>
          <Columns2 size={14} />
        </button>
      </Tooltip>
    </>
  );
};

const OutputActions: React.FC = () => (
  <Tooltip label="Clear output" side="bottom">
    <button type="button" aria-label="Clear output" onClick={() => useIdeOutputBus.getState().clear()} className={ICON_BTN}>
      <Trash2 size={14} />
    </button>
  </Tooltip>
);

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
    <div role="tablist" aria-label="Panel tabs" className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
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
          className="osio-code-btn h-7 shrink-0 px-2 text-xs sm:px-3"
        >
          {TAB_LABEL[id]}
          {id === "output" && conflicts > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-[var(--osio-chip-radius)] bg-[var(--osio-warning)] px-1 text-3xs text-[var(--osio-warning-fg)]">{conflicts}</span>
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
      data-osio-code-chrome
      style={{ height: clampDockHeight(height, globalThis.innerHeight), minHeight: "var(--osio-dock-min-h)" }}
      // A card like a pane: it clips the terminal to its corners, sits the same
      // gutter in from the canvas, and the splitter above it is the gap.
      className="mx-[var(--osio-frame-gap)] mb-[var(--osio-frame-gap)] flex shrink-0 flex-col overflow-hidden rounded-[var(--osio-radius-pane)] border-[length:var(--osio-dock-border-width)] border-[var(--osio-code-border)] bg-[var(--osio-code-bg)] shadow-[var(--osio-dock-shadow)]"
    >
      {/* The tabs scroll sideways when the actions would otherwise be pushed out of the card (phone width). */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--osio-code-border)] bg-[var(--osio-code-header-bg)] px-2 text-xs text-[var(--osio-code-fg-muted)]">
        <DockTabs active={active} conflicts={conflicts} />
        <span className="flex-1" />
        {active === "terminal" && <TerminalActions />}
        {active === "output" && <OutputActions />}
        <Tooltip label="Hide panel" side="bottom">
          <button type="button" aria-label="Hide panel" onClick={closeDock} className={ICON_BTN}>
            <X size={14} />
          </button>
        </Tooltip>
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
          {active === "debug" && (
            <React.Suspense
              fallback={<div className="min-h-0 flex-1 px-3 py-2 font-mono text-xs text-[var(--osio-code-fg-muted)]">Loading debugger…</div>}
            >
              <DebugPanel />
            </React.Suspense>
          )}
          {active === "ports" && <IdePortsPanel />}
        </div>
      )}
    </section>
  );
};
