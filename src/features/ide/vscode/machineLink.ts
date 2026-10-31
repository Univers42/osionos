/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machineLink.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The app's half of the frame contract (C0-F2): the IDE page asks for a session when it loads
// and before its token runs out; the app mints a node-scoped token (a step-up is required, C10)
// and posts it to the exact IDE origin. It never sends anything else into the window.
//
// With `identity` (a paired machine, devil verdict 2026-10-31 condition 5) a session request is
// answered with a hello first. Only an identity from the expected machine, over the nonce this
// link sent and still holds, is passed to `verify`; only a verified one leads to a mint. Each
// nonce is spent by the first answer, so a replayed identity is ignored.
import { readIdeMessage, type IdeState } from "./ideFrameProtocol.ts";

export type MintResult = { kind: "ok"; token: string } | { kind: "step-up" } | { kind: "unavailable"; reason: string };
export type MachineViewState = IdeState | "step-up" | "unavailable" | "mismatch";
export type IdentityVerdict = "ok" | "mismatch" | "unavailable";

type FrameEvent = { data: unknown; origin: string; source: unknown };

export type MachineIdentity = {
  machineId: string;
  nonce: () => string;
  verify: (nonce: string, sig: string) => Promise<IdentityVerdict>;
};

export type MachineFrameDeps = {
  frame: () => { postMessage(message: unknown, origin: string): void } | null;
  ideOrigin: string;
  listen: (handler: (event: FrameEvent) => void) => () => void;
  mint: () => Promise<MintResult>;
  onState: (state: MachineViewState) => void;
  identity?: MachineIdentity;
};

export function linkMachineFrame({ frame, ideOrigin, listen, mint, onState, identity }: MachineFrameDeps) {
  let pendingNonce: string | null = null;

  async function sendSession(): Promise<void> {
    const target = frame();
    if (!target) return;
    const result = await mint();
    if (result.kind === "ok") target.postMessage({ type: "osionos-ide/session", token: result.token }, ideOrigin);
    else onState(result.kind);
  }

  async function sayHello(): Promise<void> {
    const target = frame();
    if (!target || !identity) return;
    pendingNonce = identity.nonce();
    target.postMessage({ type: "osionos-ide/hello", nonce: pendingNonce }, ideOrigin);
  }

  async function checkIdentity(machineId: string, sig: string): Promise<void> {
    const nonce = pendingNonce;
    if (!identity || nonce === null) return;
    pendingNonce = null;
    if (machineId !== identity.machineId) return onState("mismatch");
    const verdict = await identity.verify(nonce, sig);
    if (verdict === "ok") await sendSession();
    else onState(verdict);
  }

  const requestSession = identity ? sayHello : sendSession;

  const stop = listen((event) => {
    if (event.source !== frame()) return;
    const message = readIdeMessage(event.data, event.origin, ideOrigin);
    if (message?.type === "osionos-ide/ready" && identity && message.node !== identity.machineId) onState("mismatch");
    else if (message?.type === "osionos-ide/ready" || message?.type === "osionos-ide/need-session") void requestSession();
    if (message?.type === "osionos-ide/identity") void checkIdentity(message.machineId, message.sig);
    if (message?.type === "osionos-ide/state") onState(message.state);
  });
  return { stop, retry: requestSession };
}
