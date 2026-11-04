/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machineLink.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
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
//
// With `claim` (this computer's node, opened as `/?local=1`) the machine is not known up front: the
// node's ready names it, and `claim` answers whether this account owns it. Only an owned machine
// gets the hello above. A refusal goes to the page too, so it shows words and not "Connecting…".
//
// A page that says `remembered` before its ready, or asks `need-resume`, holds a device secret for
// this app (devil verdict 2026-11-01, Amendment 1): its request mints a 60 s resume assertion after
// the same identity check, with no emailed code (R2). Any failure there falls back to the token path
// with a fresh hello, so a remembered computer is never stuck (R11).
import { readIdeMessage, type IdeState, type RefusalReason } from "./ideFrameProtocol.ts";

export type MintResult = { kind: "ok"; token: string } | { kind: "resume"; assertion: string } | { kind: "step-up" } | { kind: "unavailable"; reason: string };
/** What a session request mints: a machine token (it may need a step-up) or a resume assertion. */
export type MintMode = "token" | "resume";
export type MachineViewState = IdeState | "step-up" | RefusalReason | "no-node";
export type IdentityVerdict = "ok" | "mismatch" | "unavailable";

type FrameEvent = { data: unknown; origin: string; source: unknown };

export type MachineIdentity = {
  machineId: string;
  nonce: () => string;
  verify: (nonce: string, sig: string) => Promise<IdentityVerdict>;
};

export type ReadyDeadline = { ms: number; schedule: (fire: () => void, ms: number) => () => void };

export type MachineFrameDeps = {
  frame: () => { postMessage(message: unknown, origin: string): void } | null;
  ideOrigin: string;
  listen: (handler: (event: FrameEvent) => void) => () => void;
  mint: (mode: MintMode) => Promise<MintResult>;
  onState: (state: MachineViewState) => void;
  identity?: MachineIdentity;
  claim?: (node: string) => Promise<MachineIdentity | "other-account" | "unavailable">;
  readyWithin?: ReadyDeadline;
};

export function linkMachineFrame({ frame, ideOrigin, listen, mint, onState, identity: known, claim, readyWithin }: MachineFrameDeps) {
  let identity = known;
  let pendingNonce: string | null = null;
  let pendingMode: MintMode = "token";
  let frameRemembers = false;
  // One session request at a time. The page's `ready` and `need-session` used to run the
  // hello, identity and mint side by side, but the bridge mints once per identity check: the
  // second mint got 428, and its refusal told the frame to drop the session the first had just
  // received. The terminal then never opened, depending on which request won.
  let requesting = false;
  let requestAgain: MintMode | null = null;
  let inFlight: MintMode = "token";
  const cancelDeadline = readyWithin?.schedule(() => onState("no-node"), readyWithin.ms) ?? (() => {});

  function refuse(reason: RefusalReason): void {
    onState(reason);
    frame()?.postMessage({ type: "osionos-ide/refused", reason }, ideOrigin);
  }

  async function sendSession(mode: MintMode): Promise<void> {
    const target = frame();
    if (!target) return finishRequest(false);
    const result = await mint(mode);
    if (result.kind === "ok") target.postMessage({ type: "osionos-ide/session", token: result.token }, ideOrigin);
    else if (result.kind === "resume") target.postMessage({ type: "osionos-ide/resume", assertion: result.assertion }, ideOrigin);
    else if (mode === "resume") return startOver("token");
    else if (result.kind === "unavailable") refuse("unavailable");
    else onState(result.kind);
    finishRequest(result.kind === "ok" || result.kind === "resume");
  }

  async function sayHello(mode: MintMode): Promise<void> {
    const target = frame();
    if (!target || !identity) return finishRequest(false);
    pendingMode = mode;
    pendingNonce = identity.nonce();
    target.postMessage({ type: "osionos-ide/hello", nonce: pendingNonce }, ideOrigin);
  }

  async function checkIdentity(machineId: string, sig: string): Promise<void> {
    const nonce = pendingNonce;
    if (!identity || nonce === null) return;
    pendingNonce = null;
    if (machineId !== identity.machineId) {
      refuse("mismatch");
      return finishRequest(false);
    }
    const verdict = await identity.verify(nonce, sig);
    if (verdict === "ok") return sendSession(pendingMode);
    refuse(verdict);
    finishRequest(false);
  }

  function requestSession(mode: MintMode): Promise<void> {
    if (requesting) {
      // The page asks before its first grant arrives; a resume in flight is that grant. A token
      // queued behind it would ask for the emailed code on every load (measured, R12 e2e).
      if (inFlight !== "resume") requestAgain ??= mode;
      return Promise.resolve();
    }
    requesting = true;
    inFlight = mode;
    return identity || claim ? sayHello(mode) : sendSession(mode);
  }

  /** A request that waited runs only after a grant: a refusal or a step-up would repeat. */
  function finishRequest(granted: boolean): void {
    requesting = false;
    const again = granted ? requestAgain : null;
    requestAgain = null;
    if (again) void requestSession(again);
  }

  function startOver(mode: MintMode): Promise<void> {
    requesting = false;
    requestAgain = null;
    pendingNonce = null;
    return requestSession(mode);
  }

  /** The person's retry starts over: an identity answer that never came must not block it. A retry
   *  follows a step-up or a refusal, so it asks for a token. */
  const retry = (): Promise<void> => startOver("token");

  async function onReady(node: string): Promise<void> {
    cancelDeadline();
    if (claim && !identity) {
      const claimed = await claim(node);
      if (typeof claimed === "string") return refuse(claimed);
      identity = claimed;
    }
    if (identity && node !== identity.machineId) return refuse("mismatch");
    await requestSession(frameRemembers ? "resume" : "token");
  }

  const stopListening = listen((event) => {
    if (event.source !== frame()) return;
    const message = readIdeMessage(event.data, event.origin, ideOrigin);
    if (message?.type === "osionos-ide/ready") void onReady(message.node);
    if (message?.type === "osionos-ide/remembered") frameRemembers = true;
    if (message?.type === "osionos-ide/need-session") void requestSession("token");
    if (message?.type === "osionos-ide/need-resume") void requestSession("resume");
    if (message?.type === "osionos-ide/identity") void checkIdentity(message.machineId, message.sig);
    if (message?.type === "osionos-ide/state") onState(message.state);
  });
  const stop = () => {
    cancelDeadline();
    stopListening();
  };
  return { stop, retry };
}
