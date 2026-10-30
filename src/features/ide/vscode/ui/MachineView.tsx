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
// that osionos-node serves on its own origin (ADR-006). The app frames it and hands it a
// step-up-guarded node token; it never sees the machine's shell itself.
import React, { useEffect, useRef, useState } from "react";

import { SudoPrompt } from "@/features/settings/ui/sudo/SudoPrompt";
import { useSudoPromptStore } from "@/features/settings/ui/sudo/sudoPromptModel";
import { useUserStore } from "@/features/auth";

import { getNodeToken } from "../../api/ideToken";
import { linkMachineFrame, type MachineViewState } from "../machineLink";
import { readMachineTarget } from "../machineSession";

const MACHINE_BASE = (((import.meta.env as Record<string, string | undefined>)["VITE_OSIONOS_MACHINE_URL"] ?? "").trim()).replace(/\/+$/, "");

const MESSAGE: Partial<Record<MachineViewState, string>> = {
  "step-up": "Confirm it is you to open this machine.",
  unavailable: "This machine cannot be opened from this account.",
  error: "The machine is not reachable. Check that osionos-node is running on it.",
};

export function MachineView() {
  const target = readMachineTarget(globalThis.location.search);
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? "");
  const grants = useSudoPromptStore((state) => state.grants);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const linkRef = useRef<ReturnType<typeof linkMachineFrame> | null>(null);
  const [state, setState] = useState<MachineViewState>("connecting");
  const stateRef = useRef<MachineViewState>("connecting");
  const node = target?.node ?? "";
  const folder = target?.folder ?? "";

  useEffect(() => {
    if (!node || !MACHINE_BASE || !workspaceId) return undefined;
    const link = linkMachineFrame({
      frame: () => frameRef.current?.contentWindow ?? null,
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
  if (!MACHINE_BASE) return <p className="p-6 text-sm text-[var(--osio-fg-muted)]">No machine is connected to this osionos.</p>;
  const src = `${MACHINE_BASE}/?${new URLSearchParams({ node: target.node, folder: target.folder })}`;
  return (
    <div className="flex h-screen w-screen flex-col bg-[var(--osio-bg-canvas)]">
      {MESSAGE[state] ? (
        <div role="status" className="border-b border-[var(--osio-border)] px-4 py-2 text-sm text-[var(--osio-fg-default)]">
          {MESSAGE[state]}
        </div>
      ) : null}
      <iframe ref={frameRef} title={`${target.node}: ${target.folder}`} src={src} className="min-h-0 flex-1 border-0" />
      <SudoPrompt />
    </div>
  );
}
