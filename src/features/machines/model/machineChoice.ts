/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machineChoice.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Which of the person's machines one click opens, and the words the pairing screen uses. Pure,
// so the canvas tests cover every branch. The rule (own-machines plan §6): the default machine if
// it is online, else the first online one, else none. There is no hosted sandbox fallback: "none"
// is an answer the view explains, never a reason to open something else.

import type { Machine, PairClaim } from "../api/machinesApi";
import { readMachineTarget } from "../../ide/vscode/machineSession";
import { isMachineId } from "./machineShape";

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

export type TerminalOffer =
  | { kind: "loading" }
  | { kind: "pair" }
  | { kind: "start"; name: string }
  | { kind: "open"; name: string };

/** What the terminal panel offers instead of a hosted sandbox: the default online machine, the
 *  machine to start when none is online, or pairing one. */
export function terminalOffer(machines: readonly Machine[] | null): TerminalOffer {
  if (machines === null) return { kind: "loading" };
  const choice = chooseMachine(machines, null);
  if (choice.kind === "open") return { kind: "open", name: choice.machine.name || choice.machine.id };
  if (machines.length === 0) return { kind: "pair" };
  const preferred = machines.find((machine) => machine.isDefault) ?? machines[0];
  return { kind: "start", name: preferred.name || preferred.id };
}

/** The Terminal action opens the machine window once the list is known; with no machine yet that
 *  window shows how to pair one, so a person is never handed a hosted terminal instead. */
export function terminalOpensMachine(machines: readonly Machine[] | null): boolean {
  return machines !== null;
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
