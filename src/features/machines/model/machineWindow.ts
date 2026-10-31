/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machineWindow.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One click opens the person's own machine (own-machines plan §6). The window must open inside the
// click (the only moment a browser allows a popup), so `open` is synchronous; the handshake that
// follows (hello, identity, mint, session) runs from the page the person is already on, with the
// same link /machine uses. A second click shows the window already open instead of a second one.
import { linkMachineFrame, type IdentityVerdict, type MachineFrameDeps, type MachineViewState, type MintResult } from "../../ide/vscode/machineLink.ts";
import type { Machine } from "../api/machinesApi.ts";

export type WindowPhase = "idle" | MachineViewState;
export type OpenOutcome = "opened" | "focused" | "blocked";

type WindowLike = { closed: boolean; focus(): void; postMessage(message: unknown, origin: string): void };

export type MachineWindowDeps = {
  openWindow: (url: string, name: string) => WindowLike | null;
  listen: MachineFrameDeps["listen"];
  mint: (machineId: string) => Promise<MintResult>;
  verify: (machineId: string, nonce: string, sig: string) => Promise<IdentityVerdict>;
  nonce: () => string;
  onPhase: (phase: WindowPhase, machine: Machine | null) => void;
};

/** The machine's IDE address: its home folder unless a folder is named. */
export function machineWindowUrl(machine: Machine, folder: string | null): string {
  const params = new URLSearchParams({ node: machine.id, ...(folder ? { folder } : {}) });
  return `${machine.ideOrigin}/?${params}`;
}

export function createMachineWindow(deps: MachineWindowDeps) {
  let current: { machine: Machine; win: WindowLike; link: ReturnType<typeof linkMachineFrame> } | null = null;

  function open(machine: Machine, folder: string | null = null): OpenOutcome {
    if (current && current.machine.id === machine.id && !current.win.closed) {
      current.win.focus();
      return "focused";
    }
    current?.link.stop();
    current = null;
    const win = deps.openWindow(machineWindowUrl(machine, folder), `osionos-machine-${machine.id}`);
    if (!win) {
      deps.onPhase("error", machine);
      return "blocked";
    }
    const link = linkMachineFrame({
      frame: () => win,
      ideOrigin: machine.ideOrigin ?? "",
      listen: deps.listen,
      mint: () => deps.mint(machine.id),
      onState: (state) => deps.onPhase(state, machine),
      identity: { machineId: machine.id, nonce: deps.nonce, verify: (nonce, sig) => deps.verify(machine.id, nonce, sig) },
    });
    current = { machine, win, link };
    deps.onPhase("connecting", machine);
    return "opened";
  }

  /** After a granted step-up: the window is still open, so the handshake starts again. */
  function retry(): void {
    if (current && !current.win.closed) void current.link.retry();
  }

  return { open, retry };
}
