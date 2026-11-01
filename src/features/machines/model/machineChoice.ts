/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machineChoice.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Which of the person's machines /machine opens, what the terminal panel says while one click
// opens this computer's node, and the words the pairing screen uses. Pure, so the canvas tests
// cover every branch. The /machine rule (own-machines plan §6): the default machine if it is
// online, else the first online one, else none. There is no hosted sandbox fallback: "none" is an
// answer the view explains, never a reason to open something else.

import type { Machine, PairClaim } from "../api/machinesApi";
import { readMachineTarget } from "../../ide/vscode/machineSession";
import { isMachineId } from "./machineShape";
import type { WindowPhase } from "./machineWindow";

export type MachineChoice =
  | { kind: "open"; machine: Machine }
  | { kind: "offline"; machine: Machine }
  | { kind: "not-found" }
  | { kind: "none-online" }
  | { kind: "none" };

export type MachineRoute =
  | { kind: "choose" }
  | { kind: "machine"; id: string; folder: string | null }
  | { kind: "legacy"; node: string; folder: string };

// The relay's alphabet (scripts/bridge-machines-pairing.mjs CODE_ALPHABET): no vowels, no digits.
const PAIR_CODE = /^[BCDFGHJKLMNPQRSTVWXZ]{8}$/;
// No character here means anything to a POSIX shell, so a URL or a plain name needs no quotes.
const SHELL_SAFE = /^[A-Za-z0-9._:/@%+=,-]+$/;

export function chooseMachine(machines: readonly Machine[], requestedId: string | null): MachineChoice {
  if (requestedId !== null) {
    const named = machines.find((machine) => machine.id === requestedId);
    if (!named) return { kind: "not-found" };
    return named.online ? { kind: "open", machine: named } : { kind: "offline", machine: named };
  }
  const online = machines.filter((machine) => machine.online);
  const pick = online.find((machine) => machine.isDefault) ?? online[0];
  if (pick) return { kind: "open", machine: pick };
  return machines.length > 0 ? { kind: "none-online" } : { kind: "none" };
}

/** `/machine?…` in the app: choose, a paired machine (folder optional), or the legacy node and folder. */
export function readMachineRoute(search: string): MachineRoute | null {
  const params = new URLSearchParams(search);
  if (!params.has("node")) return { kind: "choose" };
  const target = readMachineTarget(search);
  if (!target) return null;
  if (isMachineId(target.node)) return { kind: "machine", id: target.node, folder: target.folder };
  return target.folder === null ? null : { kind: "legacy", node: target.node, folder: target.folder };
}

export type ThisComputerPanel = {
  title: string;
  detail: string;
  action: "open" | "show" | "check-again" | "settings";
  command: boolean;
};

const PANEL_TITLE = "Terminal on this computer";
const PANEL: Record<WindowPhase, ThisComputerPanel> = {
  idle: { title: PANEL_TITLE, detail: "Your terminal and your files run on this computer, through its osionos-node, in their own window.", action: "open", command: false },
  connecting: { title: PANEL_TITLE, detail: "Opening this computer's window…", action: "show", command: false },
  "step-up": { title: PANEL_TITLE, detail: "Confirm it is you to open this computer's terminal.", action: "show", command: false },
  connected: { title: PANEL_TITLE, detail: "This computer is open in its own window.", action: "show", command: false },
  reconnecting: { title: PANEL_TITLE, detail: "Reconnecting to this computer…", action: "show", command: false },
  error: { title: PANEL_TITLE, detail: "The window was blocked, or this computer's osionos-node did not answer.", action: "open", command: false },
  mismatch: { title: PANEL_TITLE, detail: "The program on this computer's osionos-node port is not the machine it claims to be. Restart osionos-node, then check again.", action: "check-again", command: false },
  unavailable: { title: PANEL_TITLE, detail: "osionos could not check this computer's machine against your account. Check again in a moment.", action: "check-again", command: false },
  "other-account": { title: "This computer is paired to another account", detail: "This computer's osionos-node belongs to another osionos account. Pair this computer with yours in Settings > Machines.", action: "settings", command: false },
  "no-node": { title: "osionos-node is not running on this computer", detail: "Start it on this computer, then check again.", action: "check-again", command: true },
};

/** What the terminal panel says while one click opens this computer's node (2026-11-01). */
export function thisComputerPanel(phase: WindowPhase): ThisComputerPanel {
  return PANEL[phase];
}

// Caveat: the bridge compares IP prefixes (clientMeta ipPrefix), so two devices behind one NAT
// look like one network and get no warning, and a phone that changed networks mid-pairing gets
// one it did not need. It is a prompt to think, not a proof of who started the code.
export function pairWarning({ startIp, yourIp }: Pick<PairClaim, "startIp" | "yourIp">): string | null {
  if (startIp === yourIp) return null;
  return `This code was started from another network (${startIp}). Approve only if you started it yourself on that machine.`;
}

/** The code as the machine printed it (`BCDF-GHJK`), or null while it is not eight code letters. */
export function normalizePairCode(input: string): string | null {
  const letters = input.toUpperCase().replace(/[^A-Z]/g, "");
  return PAIR_CODE.test(letters) ? `${letters.slice(0, 4)}-${letters.slice(4)}` : null;
}

/** One POSIX shell word: as is when it is plain, single-quoted otherwise. */
export function shellWord(value: string): string {
  return SHELL_SAFE.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

export function pairCommand(bridgeUrl: string, name: string): string {
  return `osionos-node pair --bridge ${shellWord(bridgeUrl)} --name ${shellWord(name)}`;
}

export function serveCommand(appOrigin: string): string {
  return `osionos-node serve --server <lib dir> --app-origin ${shellWord(appOrigin)}`;
}
