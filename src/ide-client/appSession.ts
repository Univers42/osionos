/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   appSession.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The IDE page's side of the app handshake (C0-F2, C6): it tells the app which machine it shows,
// receives a node-scoped IDE token, and trades it for the HttpOnly node cookie. The token is held
// only for that one request; the page keeps no credential a script could read.
import { readAppMessage, type AppMessage, type IdeMessage } from "../features/ide/vscode/ideFrameProtocol.ts";

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

function tokenExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
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

export function linkToApp(node: string, appOrigin: string): AppLink | null {
  const host = appWindow();
  if (!host || !appOrigin) return null;
  const send = (message: IdeMessage) => host.postMessage(message, appOrigin);
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
    const message: AppMessage | null = readAppMessage(event.data, event.origin, appOrigin);
    if (message?.type === "osionos-ide/session") void onSession(message.token);
    if (message?.type === "osionos-ide/open") for (const listener of openListeners) listener(message.path);
  });
  send({ type: "osionos-ide/ready", node });
  return { send, onOpen: (listener) => openListeners.push(listener), firstSession };
}
