/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   status.ts                                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The IDE page's one status line. `show` only draws it; `report` also tells the app, which a
// refusal must not do: the app already knows why, and an echoed "error" would overwrite it.
import type { IdeState, RefusalReason } from "../features/ide/vscode/ideFrameProtocol.ts";
import type { AppLink } from "./appSession.ts";

const STATUS_TEXT: Record<IdeState, string> = { connecting: "Connecting…", connected: "Connected", reconnecting: "Reconnecting…", error: "Not connected" };

export const REFUSAL_TEXT: Record<RefusalReason, string> = {
  mismatch: "the program on this port is not the machine osionos expected. Restart osionos-node",
  unavailable: "osionos could not open this machine. Try again from osionos",
  "other-account": "this computer's osionos-node is paired to another osionos account",
};

export function show(state: IdeState, detail = ""): void {
  const statusEl = document.getElementById("status") as HTMLElement;
  statusEl.dataset.state = state;
  statusEl.textContent = detail ? `${STATUS_TEXT[state]} · ${detail}` : STATUS_TEXT[state];
}

export function report(link: AppLink | null, state: IdeState, detail = ""): void {
  show(state, detail);
  link?.send({ type: "osionos-ide/state", state });
}
