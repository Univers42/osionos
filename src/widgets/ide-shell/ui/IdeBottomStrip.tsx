/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeBottomStrip.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { X } from "lucide-react";

import { useIdeSyncConflicts, conflictCount } from "@/features/ide/model/ideSyncConflicts";
import { IdeOutputPanel } from "./IdeOutputPanel";
import { IdePortsPanel } from "./IdePortsPanel";
import { IdeProblemsPanel } from "@/features/ide/ui/IdeProblemsPanel";

// Lazy so xterm.js (~250KB) loads only when the terminal panel first opens.
const IdeTerminal = React.lazy(() =>
  import("@/features/ide/ui/IdeTerminal").then((m) => ({ default: m.IdeTerminal })),
);

type DockTab = "terminal" | "problems" | "output" | "debug" | "ports";
const TABS: { id: DockTab; label: string }[] = [
  { id: "terminal", label: "Terminal" },
  { id: "problems", label: "Problems" },
  { id: "output", label: "Output" },
  { id: "debug", label: "Debug Console" },
  { id: "ports", label: "Ports" },
];

/** The VS Code-style bottom dock: Terminal / Problems / Output / Debug Console
 *  / Ports. The terminal stays MOUNTED across tab switches (hidden via CSS) so
 *  its socket and scrollback survive; the other tabs render on demand. */
export const IdeBottomStrip: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = React.useState<DockTab>("terminal");
  const conflicts = useIdeSyncConflicts((s) => conflictCount(s.byPageId));

  return (
    <section
      aria-label="Panel"
      data-code-theme="dark"
      className="flex h-52 shrink-0 flex-col border-t border-[var(--osio-code-border)] bg-[var(--osio-code-bg)]"
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--osio-code-border)] px-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--osio-code-fg-muted)]">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            data-dock-tab={id}
            onClick={() => setTab(id)}
            className={`rounded px-2 py-1 hover:text-[var(--osio-code-fg)] ${
              tab === id ? "text-[var(--osio-code-fg)] underline decoration-[var(--osio-accent)] underline-offset-4" : ""
            }`}
          >
            {label}
            {id === "output" && conflicts > 0 && (
              <span className="ml-1 rounded bg-[var(--osio-warning,#d97706)] px-1 text-[10px] text-white">{conflicts}</span>
            )}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          title="Hide panel"
          aria-label="Hide panel"
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded hover:bg-[var(--osio-code-btn-hover,rgba(127,127,127,0.12))] hover:text-[var(--osio-code-fg)]"
        >
          <X size={13} />
        </button>
      </div>
      {/* Terminal never unmounts once opened — the PTY socket and scrollback live on. */}
      <div className={tab === "terminal" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
        <React.Suspense
          fallback={
            <div className="min-h-0 flex-1 px-3 py-2 font-mono text-[12px] leading-5 text-[var(--osio-code-fg-muted)]">
              Starting terminal…
            </div>
          }
        >
          <IdeTerminal />
        </React.Suspense>
      </div>
      {tab === "problems" && <IdeProblemsPanel />}
      {tab === "output" && <IdeOutputPanel />}
      {tab === "debug" && (
        <p className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-[12px] text-[var(--osio-code-fg-muted)]">
          The debugger lands with the DAP client (ADR-003) — no fake console until it can attach for real.
        </p>
      )}
      {tab === "ports" && <IdePortsPanel />}
    </section>
  );
};
