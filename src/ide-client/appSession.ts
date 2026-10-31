/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   appSession.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/31 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The IDE page's side of the app handshake (C0-F2, C6): it tells the app which machine it shows,
// receives a node-scoped IDE token, and trades it for the HttpOnly node cookie. The token is held
// only for that one request; the page keeps no credential a script could read.
//
// A paired machine is asked to prove itself first (devil verdict 2026-10-31, condition 5): the
// app's hello nonce goes to the node's same-origin /api/machine/whoami, and the signed answer is
// handed back. The page signs nothing itself; it only relays what the node on this origin said.
import { readAppMessage, readIdeMessage, type AppMessage, type IdeMessage } from "../features/ide/vscode/ideFrameProtocol.ts";

// Ask for a new token this long before the current one ends, so the socket never sees the lease
// run out while the owner is working.
const REFRESH_LEAD_S = 120;

export type AppLink = {
  send(message: IdeMessage): void;
  onOpen(listener: (path: string) => void): void;
  firstSession: Promise<void>;
};

function appWindow(): Window | null {
  if (window.parent !== window) return window.parent;
  return window.opener as Window | null;
}

// The payload is the part before the signature in both shapes: osionos_ide1.<payload>.<sig> and
// osionos_mc1.<kid>.<payload>.<sig>.
function tokenExp(token: string): number | null {
  try {
    const parts = token.split(".");
    const payload = JSON.parse(atob(parts[parts.length - 2].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

async function mintCookie(node: string, token: string): Promise<void> {
  const res = await fetch("/api/node/session", {
    method: "POST",
    credentials: "same-origin",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ node }),
  });
  if (res.status !== 204) throw new Error(`the machine refused the session (${res.status})`);
}

// The node's answer is re-read with the app's own parser, so only a well-formed identity is sent.
async function whoami(nonce: string): Promise<IdeMessage | null> {
  const res = await fetch("/api/machine/whoami", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nonce }),
  });
  if (res.status !== 200) return null;
  const body = (await res.json().catch(() => null)) as { machineId?: unknown; sig?: unknown } | null;
  const message = readIdeMessage({ type: "osionos-ide/identity", machineId: body?.machineId, sig: body?.sig }, location.origin, location.origin);
  return message?.type === "osionos-ide/identity" ? message : null;
}

// `appOrigins` lists the web app and the desktop app. Until one answers, a message goes to each
// (the browser drops it unless the origin is the opener's); the first session pins the answer.
export function linkToApp(node: string, appOrigins: readonly string[]): AppLink | null {
  const host = appWindow();
  if (!host || appOrigins.length === 0) return null;
  let pinned: readonly string[] = appOrigins;
  const send = (message: IdeMessage) => { for (const origin of pinned) host.postMessage(message, origin); };
  const openListeners: Array<(path: string) => void> = [];
  let refresh: ReturnType<typeof setTimeout> | undefined;
  let settleFirst: { resolve: () => void; reject: (error: Error) => void } | undefined;
  const firstSession = new Promise<void>((resolve, reject) => { settleFirst = { resolve, reject }; });

  async function onSession(token: string) {
    try {
      await mintCookie(node, token);
      settleFirst?.resolve();
    } catch (error) {
      settleFirst?.reject(error as Error);
      send({ type: "osionos-ide/state", state: "error" });
      return;
    }
    settleFirst = undefined;
    clearTimeout(refresh);
    const exp = tokenExp(token);
    if (exp === null) return;
    const wait = Math.max(5, exp - REFRESH_LEAD_S - Math.floor(Date.now() / 1000)) * 1000;
    refresh = setTimeout(() => send({ type: "osionos-ide/need-session" }), wait);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== host) return;
    const message: AppMessage | null = readAppMessage(event.data, event.origin, pinned);
    if (message?.type === "osionos-ide/session") {
      pinned = [event.origin];
      void onSession(message.token);
    }
    if (message?.type === "osionos-ide/hello") {
      void whoami(message.nonce).then((identity) => send(identity ?? { type: "osionos-ide/state", state: "error" }), () => send({ type: "osionos-ide/state", state: "error" }));
    }
    if (message?.type === "osionos-ide/open") for (const listener of openListeners) listener(message.path);
  });
  send({ type: "osionos-ide/ready", node });
  return { send, onOpen: (listener) => openListeners.push(listener), firstSession };
}
