/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MachineView.tsx                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// `/machine`: a connected machine in the IDE page osionos-node serves on its own origin (ADR-006).
// Three addresses: no `node` opens the person's own default machine, `node=m-…` a paired machine
// (OwnMachineView), and any other node name the legacy shared-secret path, which still needs a
// folder and the build-time machine URL. The app never sees the machine's shell itself.
import React from "react";

import { SudoPrompt } from "@/features/settings/ui/sudo/SudoPrompt";
import { useUserStore } from "@/features/auth";
import { OwnMachineView } from "@/features/machines/ui/OwnMachineView";
import { readMachineRoute } from "@/features/machines/model/machineChoice";

import { getNodeToken } from "../../api/ideToken";
import { MachineWindowCard } from "./MachineWindowCard";

// osionos-node's own default listen address; VITE_OSIONOS_MACHINE_URL overrides it when a legacy
// machine's IDE origin lives elsewhere (another port, a tailnet name behind a proxy).
const DEFAULT_MACHINE_URL = "http://127.0.0.1:4100";
const MACHINE_BASE = (((import.meta.env as Record<string, string | undefined>)["VITE_OSIONOS_MACHINE_URL"] || DEFAULT_MACHINE_URL).trim()).replace(/\/+$/, "");

const LegacyMachine: React.FC<{ node: string; folder: string }> = ({ node, folder }) => {
  const workspaceId = useUserStore((state) => state.activeWorkspace()?._id ?? "");
  return (
    <MachineWindowCard
      label={node}
      title={folder.split("/").pop() || folder}
      subtitle={folder}
      ideOrigin={new URL(MACHINE_BASE).origin}
      windowUrl={`${MACHINE_BASE}/?${new URLSearchParams({ node, folder })}`}
      windowName={`osionos-machine-${node}`}
      mint={() => (workspaceId ? getNodeToken(workspaceId) : Promise.resolve({ kind: "unavailable", reason: "signed-out" }))}
    />
  );
};

export function MachineView() {
  const route = readMachineRoute(globalThis.location.search);
  let body: React.ReactNode;
  if (route === null) body = <p className="text-sm text-[var(--osio-fg-muted)]">This address names no machine.</p>;
  else if (route.kind === "legacy") body = <LegacyMachine node={route.node} folder={route.folder} />;
  else body = <OwnMachineView requestedId={route.kind === "machine" ? route.id : null} folder={route.kind === "machine" ? route.folder : null} />;
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--osio-bg-page)] px-6 text-[var(--osio-fg-default)]">
      {body}
      <SudoPrompt />
    </div>
  );
}
