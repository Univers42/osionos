/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   WorkbenchStatusBar.tsx                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { AlertCircle, GitBranch, PanelBottom } from "lucide-react";

import { Tooltip } from "@/shared/ui";
import { useDiagnosticsStore } from "@/features/ide/model/diagnosticsStore";
import { hasLocalTerminal } from "@/features/ide/model/localPty";
import { terminalOffer } from "@/features/machines/model/machineChoice";
import { useMachinesStore } from "@/features/machines/model/machinesStore";
import { openOwnMachine } from "@/features/machines/model/machineWindowStore";
import { openSettings } from "@/features/settings/model/settingsNav";
import {
  isSandboxOnline,
  useSandboxHealthStore,
  type SandboxHealthState,
} from "@/features/ide/model/sandboxHealthStore";
import { useSandboxBranch } from "@/features/ide/model/useSandboxBranch";
import { useWorkbenchStore } from "@/widgets/workbench/model/workbenchStore";
import { connectivityStatus, useConnectivityStore } from "@/shared/api/connectivity";

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

/** Where no hosted sandbox runs, the code runs on the person's own machine: the chip names it. */
const MachineChip: React.FC = () => {
  const offer = terminalOffer(useMachinesStore((s) => s.machines));
  const refresh = useMachinesStore((s) => s.refresh);
  const chip = {
    loading: { label: "Machine: checking", dot: DOT_CLASS.unknown, hint: "Looking for your machines", act: () => void refresh() },
    open: { label: `Machine: ${offer.kind === "open" ? offer.name : ""}`, dot: DOT_CLASS.online, hint: "Open your machine's terminal and files", act: () => { openOwnMachine(); } },
    start: { label: `Machine: ${offer.kind === "start" ? offer.name : ""} offline`, dot: DOT_CLASS.stopped, hint: "Start osionos-node on it - click to check again", act: () => void refresh() },
    pair: { label: "Add a machine", dot: DOT_CLASS.disabled, hint: "Connect your own computer for a terminal", act: () => openSettings("machines") },
  }[offer.kind];
  return (
    <Tooltip label={chip.hint} side="top">
      <button type="button" data-testid="machine-chip" onClick={chip.act} className={CHIP}>
        <span aria-hidden className={`h-2 w-2 rounded-full ${chip.dot}`} />
        {chip.label}
      </button>
    </Tooltip>
  );
};

/** The desktop app's terminal is a shell on this computer: the chip opens it in the dock. */
const LocalTerminalChip: React.FC = () => {
  const openDock = useWorkbenchStore((s) => s.openDock);
  return (
    <Tooltip label="Open a terminal on this computer" side="top">
      <button type="button" data-testid="local-terminal-chip" onClick={() => openDock("terminal")} className={CHIP}>
        <span aria-hidden className={`h-2 w-2 rounded-full ${DOT_CLASS.online}`} />
        This computer
      </button>
    </Tooltip>
  );
};

/** With a hosted sandbox the desktop app shows both chips: the terminal is this computer, the
 *  sandbox is still the server's. With none, the machine chip gives way to "This computer". */
const SandboxChip: React.FC = () => {
  const state = useSandboxHealthStore((s) => s.state);
  if (state !== "disabled") return <SandboxStateChip state={state} />;
  return hasLocalTerminal() ? null : <MachineChip />;
};

const SandboxStateChip: React.FC<{ state: SandboxHealthState }> = ({ state }) => {
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

/** Shown only while the bridge can't be reached; the toast says the change, this says it lasts (#176). */
const ConnectivityChip: React.FC = () => {
  const status = useConnectivityStore(connectivityStatus);
  if (status === "online") return null;
  const offline = status === "offline";
  return (
    <Tooltip
      label={`${offline ? "No network" : "The server is not answering"}: your changes are kept on this device and sync when the connection is back.`}
      side="top"
    >
      <span data-testid="connectivity-chip" className={CHIP_BASE}>
        <span aria-hidden className={`h-2 w-2 rounded-full ${offline ? DOT_CLASS.unavailable : DOT_CLASS.stopped}`} />
        {offline ? "Offline" : "Connection unstable"}
      </span>
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
    className="flex shrink-0 items-center gap-1 bg-transparent pl-[var(--osio-statusbar-px)] pr-[var(--osio-statusbar-end)] text-2xs text-[var(--osio-fg-muted)]"
    style={{ height: "var(--osio-statusbar-h)" }}
  >
    <ConnectivityChip />
    <BranchChip />
    {hasLocalTerminal() && <LocalTerminalChip />}
    <SandboxChip />
    <ProblemsChip />
    <span className="flex-1" />
    <PanelToggleChip />
  </footer>
);
