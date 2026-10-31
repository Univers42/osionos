/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machineWindowStore.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The one machine window of this tab, shared by every Terminal entry (menu, panel, status bar), so
// each is one click and none opens a second window. A step-up opens the prompt where the person
// is; once granted, the handshake resumes for the window already open.
import { create } from "zustand";

import { newNonce } from "@/features/ide/vscode/ideFrameProtocol";
import { openSettings } from "@/features/settings/model/settingsNav";
import { useSudoPromptStore } from "@/features/settings/ui/sudo/sudoPromptModel";
import { mintMachineToken, verifyMachineIdentity } from "../api/machinesApi";
import { chooseMachine } from "./machineChoice";
import { useMachinesStore } from "./machinesStore";
import { createMachineWindow, type WindowPhase } from "./machineWindow";

interface MachineWindowStore {
  phase: WindowPhase;
  machineName: string | null;
}

export const useMachineWindowStore = create<MachineWindowStore>()(() => ({ phase: "idle", machineName: null }));

const controller = createMachineWindow({
  openWindow: (url, name) => globalThis.open(url, name),
  listen: (handler) => {
    const onMessage = (event: MessageEvent) => handler(event);
    globalThis.addEventListener("message", onMessage);
    return () => globalThis.removeEventListener("message", onMessage);
  },
  mint: mintMachineToken,
  verify: verifyMachineIdentity,
  nonce: newNonce,
  onPhase: (phase, machine) => {
    useMachineWindowStore.setState({ phase, machineName: machine ? machine.name || machine.id : null });
    if (phase === "step-up") useSudoPromptStore.getState().show();
  },
});

let grantsSeen = useSudoPromptStore.getState().grants;
useSudoPromptStore.subscribe((state) => {
  if (state.grants <= grantsSeen) return;
  grantsSeen = state.grants;
  if (useMachineWindowStore.getState().phase === "step-up") controller.retry();
});

export type OwnMachineOutcome = "opened" | "focused" | "blocked" | "pair" | "start" | "loading";

/**
 * Call it inside the click. Opens the default online machine, or Settings › Machines when none is
 * paired; "start" means machines exist but none is online, for the caller to say so.
 */
export function openOwnMachine(): OwnMachineOutcome {
  const machines = useMachinesStore.getState().machines;
  if (machines === null) {
    globalThis.open("/machine", "osionos-machine");
    return "loading";
  }
  const choice = chooseMachine(machines, null);
  if (choice.kind === "open") return controller.open(choice.machine);
  if (machines.length === 0) {
    openSettings("machines");
    return "pair";
  }
  return "start";
}
