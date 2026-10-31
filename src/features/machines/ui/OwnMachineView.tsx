/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   OwnMachineView.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// /machine for a paired machine: without `node=` it opens the default online machine, else the
// first online one; with `node=m-…` that machine. With nothing online it says how to start or
// pair one; it never falls back to a hosted sandbox (own-machines plan §6). The window opens on
// the origin from the list, which machinesApi has re-checked with the loopback rule, and no
// folder is sent unless the address names one: the node opens its home.

import React, { useEffect, useState } from "react";

import { Button } from "@/shared/ui";
import { MachineWindowCard } from "@/features/ide/vscode/ui/MachineWindowCard";
import { newNonce } from "@/features/ide/vscode/ideFrameProtocol";

import { listMachines, machineFailure, mintMachineToken, verifyMachineIdentity, type Machine } from "../api/machinesApi";
import { chooseMachine, type MachineChoice } from "../model/machineChoice";
import { isLoopbackIdeOrigin } from "../model/machineShape";
import { useMachinesStore } from "../model/machinesStore";
import { MachineCommands } from "./MachineCommands";

type Loaded = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; choice: MachineChoice };

const CARD = "w-full max-w-md space-y-4 rounded-md border border-[var(--osio-border)] bg-[var(--osio-bg-panel)] p-6 shadow-osio-e1";

const Explain: React.FC<{ title: string; hint: string; onRetry?: () => void; children?: React.ReactNode }> = ({ title, hint, onRetry, children }) => (
  <section className={CARD} aria-labelledby="machine-explain-title">
    <h1 id="machine-explain-title" className="text-xl font-semibold">{title}</h1>
    <p className="text-sm text-[var(--osio-fg-muted)]">{hint}</p>
    {children}
    {onRetry && <Button onClick={onRetry}>Check again</Button>}
  </section>
);

function windowUrl(machine: Machine, folder: string | null): string {
  const params = new URLSearchParams({ node: machine.id, ...(folder ? { folder } : {}) });
  return `${machine.ideOrigin}/?${params}`;
}

const OpenMachine: React.FC<{ machine: Machine; folder: string | null }> = ({ machine, folder }) => (
  <MachineWindowCard
    label={machine.platform || "machine"}
    title={machine.name || machine.id}
    subtitle={folder ?? "Home folder"}
    ideOrigin={machine.ideOrigin ?? ""}
    windowUrl={windowUrl(machine, folder)}
    windowName={`osionos-machine-${machine.id}`}
    mint={() => mintMachineToken(machine.id)}
    identity={{ machineId: machine.id, nonce: newNonce, verify: (nonce, sig) => verifyMachineIdentity(machine.id, nonce, sig) }}
  />
);

export const OwnMachineView: React.FC<{ requestedId: string | null; folder: string | null }> = ({ requestedId, folder }) => {
  const remember = useMachinesStore((state) => state.remember);
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    listMachines().then(
      (machines) => { if (live) { remember(machines); setLoaded({ kind: "ready", choice: chooseMachine(machines, requestedId) }); } },
      (failure: unknown) => { if (live) setLoaded({ kind: "error", message: machineFailure(failure) }); },
    );
    return () => { live = false; };
  }, [attempt, remember, requestedId]);

  const retry = () => {
    setLoaded({ kind: "loading" });
    setAttempt((count) => count + 1);
  };

  if (loaded.kind === "loading") return <p role="status" className="text-sm text-[var(--osio-fg-muted)]">Looking for your machines…</p>;
  if (loaded.kind === "error") return <Explain title="Your machines could not be listed" hint={loaded.message} onRetry={retry} />;
  const { choice } = loaded;
  // machinesApi already refused a non-loopback origin; checked again right before a window opens.
  if (choice.kind === "open" && isLoopbackIdeOrigin(choice.machine.ideOrigin)) return <OpenMachine machine={choice.machine} folder={folder} />;
  if (choice.kind === "not-found") return <Explain title="No such machine" hint="This account has no machine with that id. Open /machine to use your default machine." />;
  if (choice.kind === "none") {
    return (
      <Explain title="No machine is paired yet" hint="Run these on the computer you want to open, then enter its code in Settings › Machines › Add a machine." onRetry={retry}>
        <MachineCommands name="" />
      </Explain>
    );
  }
  const name = choice.kind === "offline" || choice.kind === "open" ? choice.machine.name : "";
  return (
    <Explain title={name ? `${name} is offline` : "None of your machines is online"} hint="Start osionos-node on the machine, then check again." onRetry={retry}>
      <MachineCommands name="" pair={false} />
    </Explain>
  );
};
