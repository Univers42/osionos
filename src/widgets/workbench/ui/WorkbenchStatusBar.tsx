/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WorkbenchStatusBar.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { AlertCircle, GitBranch, PanelBottom } from "lucide-react";

import { Tooltip } from "@/shared/ui";
import { useDiagnosticsStore } from "@/features/ide/model/diagnosticsStore";
import {
  isSandboxOnline,
  useSandboxHealthStore,
  type SandboxHealthState,
} from "@/features/ide/model/sandboxHealthStore";
import { useSandboxBranch } from "@/features/ide/model/useSandboxBranch";
import { useWorkbenchStore } from "@/widgets/workbench/model/workbenchStore";

const STATE_LABEL: Record<SandboxHealthState, string> = {
  unknown: "Sandbox: checking",
  online: "Sandbox: online",
  stopped: "Sandbox: stopped",
  disabled: "Sandbox: disabled",
  unavailable: "Sandbox: unavailable",
};

const DOT_CLASS: Record<SandboxHealthState, string> = {
  unknown: "bg-[var(--osio-fg-subtle)]",
  online: "bg-[var(--osio-success)]",
  stopped: "bg-[var(--osio-warning)]",
  disabled: "bg-[var(--osio-fg-subtle)]",
  unavailable: "bg-[var(--osio-danger)]",
};

// Chips are control-sized (24px) pills on the canvas; the read-only branch has no hover fill.
const CHIP_BASE = "inline-flex h-[var(--osio-control-h-xs)] items-center gap-1.5 rounded-[var(--osio-control-radius)] px-2";
const CHIP = `${CHIP_BASE} transition-colors duration-(--osio-dur-fast) hover:bg-[var(--osio-control-bg-hover)]`;

/** Read-only, so no hover affordance. Renders nothing until the sandbox answers with a branch. */
const BranchChip: React.FC = () => {
  const online = useSandboxHealthStore((s) => isSandboxOnline(s.state));
  const workspaceId = useSandboxHealthStore((s) => s.workspaceId) ?? "";
  const info = useSandboxBranch(workspaceId, online);
  if (info === null || (info.branch === null && !info.detached)) return null;
  const drift = `${info.ahead > 0 ? ` ↑${info.ahead}` : ""}${info.behind > 0 ? ` ↓${info.behind}` : ""}`;
  return (
    <Tooltip label="Git branch (sandbox)" side="top">
      <span data-testid="branch-chip" className={CHIP_BASE}>
        <GitBranch size={12} aria-hidden />
        {info.detached ? "detached" : info.branch}
        {drift}
      </span>
    </Tooltip>
  );
};

const SandboxChip: React.FC = () => {
  const state = useSandboxHealthStore((s) => s.state);
  const reason = useSandboxHealthStore((s) => s.reason);
  const retry = useSandboxHealthStore((s) => s.retry);
  const online = isSandboxOnline(state);
  return (
    <Tooltip label={online ? "Sandbox is running" : `${reason ?? STATE_LABEL[state]} - click to retry`} side="top">
      <button
        type="button"
        data-testid="sandbox-chip"
        onClick={online ? undefined : () => void retry()}
        disabled={online}
        className={`${CHIP} disabled:cursor-default disabled:hover:bg-transparent`}
      >
        <span aria-hidden className={`h-2 w-2 rounded-full ${DOT_CLASS[state]}`} />
        {STATE_LABEL[state]}
      </button>
    </Tooltip>
  );
};

const ProblemsChip: React.FC = () => {
  const problems = useDiagnosticsStore((s) =>
    Object.values(s.byUri).reduce((n, list) => n + list.length, 0),
  );
  const openDock = useWorkbenchStore((s) => s.openDock);
  return (
    <Tooltip label="Problems" side="top">
      <button type="button" onClick={() => openDock("problems")} aria-label={`${problems} problems`} className={CHIP}>
        <AlertCircle size={12} aria-hidden /> {problems}
      </button>
    </Tooltip>
  );
};

const PanelToggleChip: React.FC = () => {
  const dockOpen = useWorkbenchStore((s) => s.dockOpen);
  const toggleDock = useWorkbenchStore((s) => s.toggleDock);
  return (
    <Tooltip label="Toggle panel (Ctrl+J)" side="top">
      <button type="button" onClick={toggleDock} aria-pressed={dockOpen} className={CHIP}>
        <PanelBottom size={12} aria-hidden /> Panel
      </button>
    </Tooltip>
  );
};

export const WorkbenchStatusBar: React.FC = () => (
  <footer
    data-testid="workbench-statusbar"
    className="flex shrink-0 items-center gap-1 bg-transparent px-[var(--osio-statusbar-px)] text-2xs text-[var(--osio-fg-muted)]"
    style={{ height: "var(--osio-statusbar-h)" }}
  >
    <BranchChip />
    <SandboxChip />
    <ProblemsChip />
    <span className="flex-1" />
    <PanelToggleChip />
  </footer>
);
