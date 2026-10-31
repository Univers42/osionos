/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MachineView.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// `/machine?node=<id>&folder=<abs path>`: one folder on one connected machine, in the IDE page
// that osionos-node serves on its own origin (ADR-006). The app opens it as its own window and
// hands it a step-up-guarded node token; it never sees the machine's shell itself. Not a frame:
// the app and a machine are two sites, and a cross-site frame never gets its cookie (C0-F1,
// measured in tests/machine).
import React, { useEffect, useRef, useState } from "react";

import { SudoPrompt } from "@/features/settings/ui/sudo/SudoPrompt";
import { useSudoPromptStore } from "@/features/settings/ui/sudo/sudoPromptModel";
import { useUserStore } from "@/features/auth";

import { getNodeToken } from "../../api/ideToken";
import { linkMachineFrame, type MachineViewState } from "../machineLink";
import { readMachineTarget } from "../machineSession";

// osionos-node's own default listen address; VITE_OSIONOS_MACHINE_URL overrides it when a machine's
// IDE origin lives elsewhere (another port, a tailnet name behind a proxy).
const DEFAULT_MACHINE_URL = "http://127.0.0.1:4100";
const MACHINE_BASE = (((import.meta.env as Record<string, string | undefined>)["VITE_OSIONOS_MACHINE_URL"] || DEFAULT_MACHINE_URL).trim()).replace(/\/+$/, "");

const MESSAGE: Partial<Record<MachineViewState, string>> = {
  "step-up": "Confirm it is you to open this machine.",
  unavailable: "This machine cannot be opened from this account.",
  error: "The machine is not reachable, or the window was blocked. Check that osionos-node is running on it.",
};

const STATUS: Partial<Record<MachineViewState, string>> = {
  connecting: "Ready to open.",
  connected: "Open in its own window.",
  reconnecting: "Reconnecting…",
};

export function MachineView() {
  const target = readMachineTarget(globalThis.location.search);
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? "");
  const grants = useSudoPromptStore((state) => state.grants);
  const windowRef = useRef<Window | null>(null);
  const [opened, setOpened] = useState(false);
  const linkRef = useRef<ReturnType<typeof linkMachineFrame> | null>(null);
  const [state, setState] = useState<MachineViewState>("connecting");
  const stateRef = useRef<MachineViewState>("connecting");
  const node = target?.node ?? "";
  const folder = target?.folder ?? "";

  useEffect(() => {
    if (!node || !workspaceId) return undefined;
    const link = linkMachineFrame({
      frame: () => windowRef.current,
      ideOrigin: new URL(MACHINE_BASE).origin,
      listen: (handler) => {
        const onMessage = (event: MessageEvent) => handler(event);
        globalThis.addEventListener("message", onMessage);
        return () => globalThis.removeEventListener("message", onMessage);
      },
      mint: () => getNodeToken(workspaceId),
      onState: (next) => {
        stateRef.current = next;
        setState(next);
      },
    });
    linkRef.current = link;
    return link.stop;
  }, [node, folder, workspaceId]);

  // A granted step-up retries once, the way the settings panels do.
  useEffect(() => {
    if (grants > 0 && stateRef.current === "step-up") void linkRef.current?.retry();
  }, [grants]);

  if (!target) return <p className="p-6 text-sm text-[var(--osio-fg-muted)]">This address names no machine folder.</p>;
  const src = `${MACHINE_BASE}/?${new URLSearchParams({ node: target.node, folder: target.folder })}`;
  // A popup needs the click itself; the window keeps its opener so the token can reach it.
  const open = () => {
    windowRef.current = globalThis.open(src, `osionos-machine-${target.node}`);
    if (!windowRef.current) setState("error");
    setOpened(Boolean(windowRef.current));
  };
  const name = target.folder.split("/").pop() || target.folder;
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--osio-bg-page)] px-6 text-[var(--osio-fg-default)]">
      <section className="w-full max-w-md rounded-md border border-[var(--osio-border)] bg-[var(--osio-bg-panel)] p-6 shadow-osio-e1">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--osio-fg-muted)]">{target.node}</p>
        <h1 className="mt-2 text-2xl font-semibold">{name}</h1>
        <p className="mt-1 truncate text-sm text-[var(--osio-fg-muted)]" title={target.folder}>{target.folder}</p>
        <p role="status" className="mt-4 text-sm">{MESSAGE[state] ?? STATUS[state] ?? ""}</p>
        <button
          type="button"
          className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-[var(--osio-accent)] px-4 py-2 text-sm font-medium text-[var(--osio-accent-fg)] hover:opacity-90"
          onClick={open}
        >
          {opened ? "Show the window" : "Open in a new window"}
        </button>
      </section>
      <SudoPrompt />
    </div>
  );
}
