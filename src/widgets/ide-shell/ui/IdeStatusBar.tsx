/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   IdeStatusBar.tsx                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { GitBranch, GitCompareArrows, SquareTerminal } from "lucide-react";

import { useIdeSyncConflicts, conflictCount } from "@/features/ide/model/ideSyncConflicts";
import { isSandboxOnline, useSandboxHealthStore, type SandboxHealthState } from "@/features/ide/model/sandboxHealthStore";

const CHIP_LABEL: Readonly<Record<SandboxHealthState, string>> = {
  unknown: "Checking…",
  online: "Online",
  stopped: "Stopped",
  unavailable: "Unavailable",
  disabled: "Disabled",
};
const CHIP_DOT: Readonly<Record<SandboxHealthState, string>> = {
  unknown: "bg-[var(--osio-code-fg-muted)]",
  online: "bg-[var(--osio-success)]",
  stopped: "bg-[var(--osio-warning)]",
  unavailable: "bg-[var(--osio-danger)]",
  disabled: "bg-[var(--osio-code-fg-muted)]",
};

/** Dot + text (never colour alone); clicking re-probes when the sandbox is not online. */
const SandboxChip: React.FC = () => {
  const state = useSandboxHealthStore((s) => s.state);
  const retry = useSandboxHealthStore((s) => s.retry);
  const online = isSandboxOnline(state);
  return (
    <button
      type="button"
      onClick={() => { if (!online) void retry(); }}
      title={online ? "Sandbox is online" : "Click to retry the sandbox connection"}
      className="inline-flex items-center gap-1 hover:text-[var(--osio-code-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--osio-accent)]"
    >
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${CHIP_DOT[state]}`} />
      Sandbox: {CHIP_LABEL[state]}
    </button>
  );
};

interface Props {
  fileCount: number;
  onToggleTerminal: () => void;
}

/** The bottom status bar spanning the shell — mode, project size, and a terminal
 *  toggle. Branch / language / diagnostics slots fill as later phases land. */
export const IdeStatusBar: React.FC<Props> = ({ fileCount, onToggleTerminal }) => {
  const conflicts = useIdeSyncConflicts((s) => conflictCount(s.byPageId));
  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-[var(--osio-code-border)] bg-[var(--osio-code-header-bg)] px-3 font-mono text-[11px] text-[var(--osio-code-fg-muted)]">
      <span className="inline-flex items-center gap-1 text-[var(--osio-accent)]">IDE</span>
      {conflicts > 0 && (
        <span
          className="inline-flex items-center gap-1 text-[var(--osio-warning)]"
          title="Open a conflicted file to resolve (keep mine / take sandbox)"
        >
          <GitCompareArrows size={12} /> {conflicts} sync {conflicts === 1 ? "conflict" : "conflicts"}
        </span>
      )}
      <button
        type="button"
        onClick={onToggleTerminal}
        title="Toggle terminal"
        className="inline-flex items-center gap-1 hover:text-[var(--osio-code-fg)]"
      >
        <SquareTerminal size={12} /> Terminal
      </button>
      <SandboxChip />
      <span className="flex-1" />
      <span className="inline-flex items-center gap-1 opacity-70" title="Git status arrives with the sandbox">
        <GitBranch size={12} /> —
      </span>
      <span>{fileCount} {fileCount === 1 ? "file" : "files"}</span>
      <span>UTF-8</span>
    </footer>
  );
};
