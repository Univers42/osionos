/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   machineLink.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The app's half of the frame contract (C0-F2): the framed IDE page asks for a session when it
// loads and before its token runs out; the app mints a node-scoped token (a step-up is required,
// C10) and posts it to the exact IDE origin. It never sends anything else into the frame.
import { readIdeMessage, type IdeState } from "./ideFrameProtocol.ts";

export type MintResult = { kind: "ok"; token: string } | { kind: "step-up" } | { kind: "unavailable"; reason: string };
export type MachineViewState = IdeState | "step-up" | "unavailable";

type FrameEvent = { data: unknown; origin: string; source: unknown };

export type MachineFrameDeps = {
  frame: () => { postMessage(message: unknown, origin: string): void } | null;
  ideOrigin: string;
  listen: (handler: (event: FrameEvent) => void) => () => void;
  mint: () => Promise<MintResult>;
  onState: (state: MachineViewState) => void;
};

export function linkMachineFrame({ frame, ideOrigin, listen, mint, onState }: MachineFrameDeps) {
  async function sendSession(): Promise<void> {
    const target = frame();
    if (!target) return;
    const result = await mint();
    if (result.kind === "ok") target.postMessage({ type: "osionos-ide/session", token: result.token }, ideOrigin);
    else onState(result.kind);
  }

  const stop = listen((event) => {
    if (event.source !== frame()) return;
    const message = readIdeMessage(event.data, event.origin, ideOrigin);
    if (message?.type === "osionos-ide/ready" || message?.type === "osionos-ide/need-session") void sendSession();
    if (message?.type === "osionos-ide/state") onState(message.state);
  });
  return { stop, retry: sendSession };
}
