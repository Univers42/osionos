/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machineWindow.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/31 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// One click opens this computer's own node (own-machines plan §6, owner 2026-11-01). The window must
// open inside the click (the only moment a browser allows a popup), so `open` is synchronous and
// chooses no machine: every machine's IDE origin is the same loopback address, so an id chosen from
// the account's list would be another computer's on this one. The node names itself in `ready`;
// the account's list decides whether it is ours, then hello, identity, mint and session follow.
import { linkMachineFrame, type IdentityVerdict, type MachineFrameDeps, type MachineViewState, type MintResult } from "../../ide/vscode/machineLink.ts";
import type { Machine } from "../api/machinesApi.ts";

export type WindowPhase = "idle" | MachineViewState;
export type OpenOutcome = "opened" | "focused" | "blocked";

/** osionos-node's default listen address (packages/osionos-node/cli.mjs), a loopback IDE origin. */
export const LOCAL_NODE_ORIGIN = "http://127.0.0.1:4100";

// Caveat: a node that is up but slow (a cold disk, a loaded machine) can miss this and read as
// "not running"; "Check again" opens it once more. The page sends `ready` from its light entry,
// before the VS Code bundle is requested, so the bundle's size is not in this number.
export const READY_TIMEOUT_MS = 4000;

type WindowLike = { closed: boolean; focus(): void; close(): void; postMessage(message: unknown, origin: string): void };

export type MachineWindowDeps = {
  openWindow: (url: string, name: string) => WindowLike | null;
  listen: MachineFrameDeps["listen"];
  lookup: (machineId: string) => Promise<Machine | "other-account" | "unavailable">;
  mint: (machineId: string) => Promise<MintResult>;
  verify: (machineId: string, nonce: string, sig: string) => Promise<IdentityVerdict>;
  nonce: () => string;
  schedule: (fire: () => void, ms: number) => () => void;
  onPhase: (phase: WindowPhase, machine: Machine | null) => void;
};

export function localWindowUrl(): string {
  return `${LOCAL_NODE_ORIGIN}/?local=1`;
}

export function createMachineWindow(deps: MachineWindowDeps) {
  let current: { win: WindowLike; link: ReturnType<typeof linkMachineFrame> } | null = null;

  function open(): OpenOutcome {
    if (current && !current.win.closed) {
      current.win.focus();
      return "focused";
    }
    current?.link.stop();
    current = null;
    const win = deps.openWindow(localWindowUrl(), "osionos-machine-local");
    if (!win) {
      deps.onPhase("error", null);
      return "blocked";
    }
    let machine: Machine | null = null;
    const link = linkMachineFrame({
      frame: () => win,
      ideOrigin: LOCAL_NODE_ORIGIN,
      listen: deps.listen,
      mint: () => (machine ? deps.mint(machine.id) : Promise.resolve({ kind: "unavailable", reason: "no-machine" })),
      onState: (state) => {
        if (state === "no-node") win.close();
        deps.onPhase(state, machine);
      },
      claim: async (node) => {
        const found = await deps.lookup(node);
        if (typeof found === "string") return found;
        machine = found;
        return { machineId: found.id, nonce: deps.nonce, verify: (nonce, sig) => deps.verify(found.id, nonce, sig) };
      },
      readyWithin: { ms: READY_TIMEOUT_MS, schedule: deps.schedule },
    });
    current = { win, link };
    deps.onPhase("connecting", null);
    return "opened";
  }

  /** After a granted step-up: the window is still open, so the handshake starts again. */
  function retry(): void {
    if (current && !current.win.closed) void current.link.retry();
  }

  return { open, retry };
}
