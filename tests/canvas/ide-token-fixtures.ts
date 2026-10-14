/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-token-fixtures.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  createIdeTokenSource,
  type IdeTokenDeps,
  type IdeTokenSource,
} from "../../src/features/ide/api/ideToken.ts";

export const T0 = 1_700_000_000_000;
export const APP_TOKEN = "app-token-xyz";
export const API = "https://api.example.com";
export const IDE = "https://ide.example";
export const WS = "11111111-1111-4111-8111-111111111111";
export const TTL_MS = 15 * 60_000;

export interface Call {
  url: string;
  init: RequestInit;
}

export type Handler = (call: Call, nth: number) => Response | Promise<Response>;

export function mintResponse(token: string, expiresAtMs: number): Response {
  return new Response(JSON.stringify({ ok: true, token, expiresAt: new Date(expiresAtMs).toISOString() }), { status: 200 });
}

export interface FakeEnv {
  calls: Call[];
  clock: { now: number };
  deps: IdeTokenDeps;
  source: IdeTokenSource;
  mints: () => Call[];
}

interface EnvOpts {
  ideBase?: string;
  appToken?: string | null;
  apiBase?: string;
  handler?: Handler;
}

// One recording fetch shared by the mint and by IDE traffic, so a test can assert
// over every request the client ever made. Default handler mints ide-tok-1, 2, ...
export function fakeEnv(opts: EnvOpts = {}): FakeEnv {
  const calls: Call[] = [];
  const clock = { now: T0 };
  let minted = 0;
  const handler: Handler =
    opts.handler ??
    ((call) => {
      if (call.url.endsWith("/api/ide/token")) {
        minted += 1;
        return mintResponse(`osionos_ide1.tok-${minted}`, clock.now + TTL_MS);
      }
      return new Response("{}", { status: 200 });
    });
  const deps: IdeTokenDeps = {
    fetch: (url, init) => {
      const call = { url, init };
      calls.push(call);
      return Promise.resolve(handler(call, calls.length - 1));
    },
    now: () => clock.now,
    app: () => Promise.resolve({ apiBase: opts.apiBase ?? API, token: opts.appToken === undefined ? APP_TOKEN : opts.appToken }),
    ideBase: () => opts.ideBase ?? IDE,
  };
  return { calls, clock, deps, source: createIdeTokenSource(deps), mints: () => calls.filter((c) => c.url.endsWith("/api/ide/token")) };
}

export function headerOf(call: Call, name: string): string | null {
  return new Headers(call.init.headers).get(name);
}
