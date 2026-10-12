/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-sandbox-health-fixtures.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import {
  createHealthCore,
  type HealthCore,
  type HealthDeps,
} from "../../src/features/ide/model/sandboxHealthCore.ts";

export type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

export interface RecordedCall {
  url: string;
  init: RequestInit;
}

interface FakeOpts {
  apiBase?: string;
  jwt?: string | null;
  now?: () => number;
}

// A core driven by a recording fake fetch. The default clock is fixed so
// checkedAt assertions are exact; pass `now` to move it.
export function fakeCore(handler: Handler, opts: FakeOpts = {}): { core: HealthCore; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const deps: HealthDeps = {
    fetch: (url, init) => {
      calls.push({ url, init });
      return Promise.resolve(handler(url, init));
    },
    apiBase: () => opts.apiBase ?? "https://api.example.com",
    jwt: () => (opts.jwt === undefined ? "token-123" : opts.jwt),
    now: opts.now ?? (() => 1000),
  };
  const core = createHealthCore(deps);
  return { core, calls };
}

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (err: unknown) => void } {
  let resolve: (value: T) => void = () => undefined;
  let reject: (err: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function authHeader(call: RecordedCall): string | undefined {
  return (call.init.headers as Record<string, string>).Authorization;
}
