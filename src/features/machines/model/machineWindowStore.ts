/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machineWindowStore.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The one machine window of this tab, shared by every Terminal entry (menu, panel, status bar), so
// each is one click and none opens a second window. A step-up opens the prompt where the person
// is; once granted, the handshake resumes for the window already open.
import { create } from "zustand";

import { newNonce } from "@/features/ide/vscode/ideFrameProtocol";
import { useSudoPromptStore } from "@/features/settings/ui/sudo/sudoPromptModel";
import { mintMachineToken, verifyMachineIdentity, type Machine } from "../api/machinesApi";
import { useMachinesStore } from "./machinesStore";
import { createMachineWindow, type OpenOutcome, type WindowPhase } from "./machineWindow";

interface MachineWindowStore {
  phase: WindowPhase;
  machineName: string | null;
}

export const useMachineWindowStore = create<MachineWindowStore>()(() => ({ phase: "idle", machineName: null }));

// The node's id against this account's list. The cached list may predate a pairing made since, so
// a miss reloads it once before saying "other-account"; a list that cannot load is "unavailable":
// only a loaded list may say the machine is not ours.
const findCached = (machineId: string) => useMachinesStore.getState().machines?.find((machine) => machine.id === machineId);

async function lookupOwnMachine(machineId: string): Promise<Machine | "other-account" | "unavailable"> {
  const cached = findCached(machineId);
  if (cached) return cached;
  await useMachinesStore.getState().refresh();
  if (useMachinesStore.getState().machines === null) return "unavailable";
  return findCached(machineId) ?? "other-account";
}

const controller = createMachineWindow({
  openWindow: (url, name) => globalThis.open(url, name),
  machines: () => useMachinesStore.getState().machines,
  lookup: lookupOwnMachine,
  schedule: (fire, ms) => {
    const timer = setTimeout(fire, ms);
    return () => clearTimeout(timer);
  },
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

/** Call it inside the click: it opens this computer's node, which names its machine itself. */
export function openOwnMachine(): OpenOutcome {
  return controller.open();
}
