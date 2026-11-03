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
// trusts no machine id up front: every machine's IDE origin is the same loopback address, so an id
// chosen from the account's list may be another computer's. The address carries one only as a hint
// for pages installed before local=1. The node names itself in `ready`; the account's list decides
// whether it is ours, then hello, identity (signed by the node's own key), mint and session follow.
import { linkMachineFrame, type IdentityVerdict, type MachineFrameDeps, type MachineViewState, type MintResult } from "../../ide/vscode/machineLink.ts";
import type { Machine } from "../api/machinesApi.ts";
import { localNodeHint } from "./machineChoice.ts";

export type WindowPhase = "idle" | MachineViewState;
export type OpenOutcome = "opened" | "focused" | "blocked";

/** osionos-node's default listen address (packages/osionos-node/cli.mjs), a loopback IDE origin. */
export const LOCAL_NODE_ORIGIN = "http://127.0.0.1:4100";

/** What a frame of the node's pages (terminal, editor) may use: the loopback node, and the clipboard
 *  (paste needs clipboard-read on the cross-origin frame, measured 2026-11-01). Pass it through
 *  frameAllow, which drops the names the browser does not know. */
export const NODE_FRAME_PERMISSIONS = "local-network-access; clipboard-read; clipboard-write";

// Caveat: a slow cold load (a cold disk, a loaded machine, a slow popup) can miss this and read as
// "not running" while the node is up; "Check again" opens it once more. The page sends `ready` from
// its light entry, before the VS Code bundle is requested, which is what makes a short bound safe.
// Measured 2026-11-01, window.open to ready, fresh browser context each run (cold HTTP cache),
// 20 runs, headless Chromium on the owner's laptop against a loopback node: light entry p50 62-74
// ms, max 80-113 ms; the page that sent ready after the bundle, p50 838 ms, max 1037 ms. 3 s is
// ~25x the light entry's worst run and ~3x the old page's. A headed popup was not measured.
export const READY_TIMEOUT_MS = 3000;

type WindowLike = { closed: boolean; focus(): void; close(): void; postMessage(message: unknown, origin: string): void };

export type MachineWindowDeps = {
  openWindow: (url: string, name: string) => WindowLike | null;
  /** The account's cached machine list, read inside the click: null while it has not loaded. */
  machines: () => readonly Machine[] | null;
  listen: MachineFrameDeps["listen"];
  lookup: (machineId: string) => Promise<Machine | "other-account" | "unavailable">;
  mint: (machineId: string) => Promise<MintResult>;
  verify: (machineId: string, nonce: string, sig: string) => Promise<IdentityVerdict>;
  nonce: () => string;
  schedule: (fire: () => void, ms: number) => () => void;
  onPhase: (phase: WindowPhase, machine: Machine | null) => void;
};

/** `/?local=1`, plus `node=<hint>` for a page installed before local=1 (it reads only `node`). */
export function localWindowUrl(hint: string | null = null): string {
  const node = hint === null ? "" : `&node=${encodeURIComponent(hint)}`;
  return `${LOCAL_NODE_ORIGIN}/?local=1${node}`;
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
    const win = deps.openWindow(localWindowUrl(localNodeHint(deps.machines())), "osionos-machine-local");
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
