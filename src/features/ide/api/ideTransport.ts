/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideTransport.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { IDE_BASE, getIdeToken, invalidateIdeToken, type IdeTokenResult, type IdeTokenSource, type IdeUnavailableReason } from "./ideToken";

// The only HTTP and WebSocket entry point to the IDE origin: every sandbox call site
// goes through ideFetch or ideSocketTarget, so the bearer is always the IDE token.

export type IdeFetchResult = { kind: "response"; response: Response } | { kind: "unavailable"; reason: IdeUnavailableReason };

export type IdeSocketTarget = { kind: "ok"; url: string; protocols: string[] } | { kind: "unavailable"; reason: IdeUnavailableReason };

export interface IdeTransportDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** "" means the IDE is not configured. */
  ideBase: () => string;
}

export interface IdeTransport {
  ideFetch: (workspaceId: string, path: string, init?: RequestInit) => Promise<IdeFetchResult>;
  ideSocketTarget: (workspaceId: string, path: string, params?: Readonly<Record<string, string>>) => Promise<IdeSocketTarget>;
}

/** The bridge selects and echoes "osio-ide.v1"; the token rides the subprotocol, NOT the
 *  URL, because query strings land in access logs. IDE tokens are header-safe. */
export function ideWsProtocols(token: string): string[] {
  return ["osio-ide.v1", `osio-token.${token}`];
}

async function sendWithToken(
  deps: IdeTransportDeps,
  token: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  return deps.fetch(`${deps.ideBase()}${path}`, { ...init, headers });
}

export function createIdeTransport(source: IdeTokenSource, deps: IdeTransportDeps): IdeTransport {
  const attempt = async (workspaceId: string, path: string, init: RequestInit): Promise<IdeFetchResult> => {
    const minted: IdeTokenResult = await source.get(workspaceId);
    if (minted.kind === "unavailable") return minted;
    return { kind: "response", response: await sendWithToken(deps, minted.token, path, init) };
  };

  const ideFetch = async (workspaceId: string, path: string, init: RequestInit = {}): Promise<IdeFetchResult> => {
    const first = await attempt(workspaceId, path, init);
    if (first.kind !== "response" || first.response.status !== 401) return first;
    // One retry, no loop: a second 401 is the server's real answer. Ponytail: a request body
    // that is a one-shot stream cannot be replayed; every IDE caller sends a JSON string.
    source.invalidate(workspaceId);
    return attempt(workspaceId, path, init);
  };

  const ideSocketTarget = async (
    workspaceId: string,
    path: string,
    params: Readonly<Record<string, string>> = {},
  ): Promise<IdeSocketTarget> => {
    const minted = await source.get(workspaceId);
    if (minted.kind === "unavailable") return minted;
    const query = new URLSearchParams({ workspaceId, ...params });
    const base = deps.ideBase().replace(/^http/, "ws"); // http→ws, https→wss
    return { kind: "ok", url: `${base}${path}?${query.toString()}`, protocols: ideWsProtocols(minted.token) };
  };

  return { ideFetch, ideSocketTarget };
}

/** After close 4011 a socket may redial at once with a fresh token, but only once until
 *  one opens: a server that keeps answering 4011 falls back to the normal backoff. */
export function createExpiredReconnect(invalidate: (workspaceId: string) => void): {
  onExpired: (workspaceId: string) => boolean;
  opened: () => void;
} {
  let spent = false;
  return {
    onExpired(workspaceId) {
      if (spent) return false;
      spent = true;
      invalidate(workspaceId);
      return true;
    },
    opened() {
      spent = false;
    },
  };
}

const defaultTransport = createIdeTransport(
  { get: getIdeToken, invalidate: invalidateIdeToken },
  { fetch: (url, init) => fetch(url, init), ideBase: () => IDE_BASE },
);

export const ideFetch = defaultTransport.ideFetch;
export const ideSocketTarget = defaultTransport.ideSocketTarget;

export function expiredReconnect(): ReturnType<typeof createExpiredReconnect> {
  return createExpiredReconnect(invalidateIdeToken);
}
