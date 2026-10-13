/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-attach-fixtures.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Provider fixtures for the attach-reconcile tests: an in-memory sandbox that
// counts writes, measures in-flight calls, and injects per-path failures.

import { createMemProvider } from "../../src/features/ide/vfs/memProvider.ts";
import { buildVPath } from "../../src/features/ide/vfs/vpath.ts";
import { collectBytes, textToBytes, bytesToText } from "../../src/features/ide/vfs/bytes.ts";
import { fsError } from "../../src/features/ide/vfs/errors.ts";
import type { FsProvider } from "../../src/features/ide/vfs/types.ts";

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const at = (provider: FsProvider, path: string) => buildVPath(provider.scheme, "t", path.split("/"));

export async function seed(provider: FsProvider, files: Record<string, string | Uint8Array>): Promise<void> {
  for (const [path, data] of Object.entries(files)) {
    const segments = path.split("/");
    for (let depth = 1; depth < segments.length; depth += 1) {
      await provider.mkdir(buildVPath(provider.scheme, "t", segments.slice(0, depth))).catch(() => undefined);
    }
    await provider.write(at(provider, path), typeof data === "string" ? textToBytes(data) : data);
  }
}

export async function readText(provider: FsProvider, path: string): Promise<string | null> {
  try {
    return bytesToText(await collectBytes(await provider.read(at(provider, path))));
  } catch {
    return null;
  }
}

export async function readBytes(provider: FsProvider, path: string): Promise<number[]> {
  return [...(await collectBytes(await provider.read(at(provider, path))))];
}

export type Stats = { writes: string[]; inFlight: number; maxInFlight: number };
export type InstrumentOptions = { delayMs?: number; failRead?: string[]; failWrite?: string[] };

export function instrumented(opts: InstrumentOptions = {}): { provider: FsProvider; base: FsProvider; stats: Stats } {
  const base = createMemProvider("mem");
  const stats: Stats = { writes: [], inFlight: 0, maxInFlight: 0 };
  const track = async <T>(run: () => Promise<T>): Promise<T> => {
    stats.inFlight += 1;
    stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
    try {
      if (opts.delayMs) await sleep(opts.delayMs);
      return await run();
    } finally {
      stats.inFlight -= 1;
    }
  };
  const provider: FsProvider = {
    ...base,
    read: (path, readOpts) => track(async () => {
      if (opts.failRead?.includes(path.compareKey)) throw fsError("Io", path.uri, "injected read failure");
      return base.read(path, readOpts);
    }),
    write: (path, data, writeOpts) => track(async () => {
      if (opts.failWrite?.includes(path.compareKey)) throw fsError("Io", path.uri, "injected write failure");
      stats.writes.push(path.compareKey);
      return base.write(path, data, writeOpts);
    }),
  };
  return { provider, base, stats };
}

/** A sandbox already holding `files` — seeded underneath the instrumentation,
 *  so injected failures and the write counter only see the code under test. */
export async function seeded(files: Record<string, string | Uint8Array>, opts: InstrumentOptions = {}) {
  const sandbox = instrumented(opts);
  await seed(sandbox.base, files);
  return sandbox;
}
