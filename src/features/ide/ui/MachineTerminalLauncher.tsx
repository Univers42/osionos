/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   MachineTerminalLauncher.tsx                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The terminal panel where no hosted sandbox runs (own-machines plan §6): a terminal is the
// person's own machine, so one click opens the default one in its window, says which machine to
// start, or leads to pairing one. The panel then follows that window's state.
import React from "react";
import { Laptop } from "lucide-react";
import { Button } from "@/shared/ui";

import { terminalOffer } from "@/features/machines/model/machineChoice";
import { useMachinesStore } from "@/features/machines/model/machinesStore";
import { openOwnMachine, useMachineWindowStore } from "@/features/machines/model/machineWindowStore";
import type { WindowPhase } from "@/features/machines/model/machineWindow";
import { openSettings } from "@/features/settings/model/settingsNav";
import { CODE_BUTTON, StateBlock } from "./ExplorerStates";

const openMachineWindow = () => { openOwnMachine(); };

// What the panel says once the window exists; "idle" keeps the offer's own words.
const PHASE_LINE: Partial<Record<WindowPhase, string>> = {
  connecting: "Opening its window…",
  "step-up": "Confirm it is you to open it.",
  connected: "Open in its own window.",
  reconnecting: "Reconnecting…",
  error: "The window was blocked, or the machine did not answer. Check that osionos-node runs on it.",
  mismatch: "The program on this machine's port is not this machine. Restart osionos-node on it.",
  unavailable: "This machine cannot be opened from this account.",
};

export const MachineTerminalLauncher: React.FC = () => {
  const machines = useMachinesStore((state) => state.machines);
  const refresh = useMachinesStore((state) => state.refresh);
  React.useEffect(() => { void refresh(); }, [refresh]);
  const offer = terminalOffer(machines);
  const phase = useMachineWindowStore((state) => state.phase);
  const opened = phase !== "idle";

  const body = {
    loading: { title: "Looking for your machines…", detail: null, actions: null },
    open: {
      title: `Terminal on ${offer.kind === "open" ? offer.name : ""}`,
      detail: PHASE_LINE[phase] ?? "Your terminal and your files run on your own machine, in their own window.",
      actions: <Button size="sm" tone="primary" className={CODE_BUTTON} onClick={openMachineWindow}>{opened ? "Show window" : "Open terminal"}</Button>,
    },
    start: {
      title: `${offer.kind === "start" ? offer.name : ""} is not running`,
      detail: "Start osionos-node on that machine, then check again.",
      actions: <Button size="sm" className={CODE_BUTTON} onClick={() => void refresh()}>Check again</Button>,
    },
    pair: {
      title: "Connect your own machine",
      detail: "Terminals run on a computer you pair with your account, never on a shared server.",
      actions: <Button size="sm" tone="primary" className={CODE_BUTTON} onClick={() => openSettings("machines")}>Add a machine</Button>,
    },
  }[offer.kind];

  return (
    <div role="status" aria-live="polite" className="flex h-full w-full items-center justify-center overflow-auto bg-[var(--osio-code-bg)]">
      <StateBlock icon={Laptop} title={body.title} tone="code" actions={body.actions}>
        {body.detail && <p>{body.detail}</p>}
      </StateBlock>
    </div>
  );
};
