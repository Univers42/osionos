/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   bridgeTransport.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { ideFetch } from "../api/ideTransport";
import { fsError, providerWideError, type FsErrorCode } from "./errors";
import type { FsOpTransport } from "./sandboxFsOps";

// The bridge's ide-fs bucket (120 requests, then 20 a second) answers 429 before
// it runs anything, so a retry never repeats an op. A save during a 500-file
// attach used to fail as "bridge 429"; now it waits up to 3.75 s in four steps.
const THROTTLE_WAITS_MS = [250, 500, 1000, 2000];
// Statuses that no other op would escape either: the caller stops walking its paths. A 413
// or a 500 can belong to one op, so they stay per-op.
// Caveat: a 502-504 caused by one slow op also stops an attach; the files it did not reach
// wait for the next attach, and the Output line counts them as not reconciled.
const PROVIDER_WIDE = new Set([401, 403, 404, 409, 429, 502, 503, 504]);

export type BridgeFsDeps = { fetch: typeof ideFetch; sleep: (ms: number) => Promise<void> };
const liveDeps: BridgeFsDeps = { fetch: ideFetch, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

/** Production transport for the sandbox:// provider: POST /api/ide/fs with an
 *  `op`. HTTP-layer failures map here; op-level failures ride the exec result
 *  and map in sandboxFsOps. */
export function bridgeFsTransport(workspaceId: string, deps: BridgeFsDeps = liveDeps): FsOpTransport {
  return async (op, params) => {
    if (!workspaceId) throw fsError("Unsupported", undefined, "bridge unavailable (no session)");
    let result: Awaited<ReturnType<typeof ideFetch>>;
    for (let attempt = 0; ; attempt += 1) {
      try {
        result = await deps.fetch(workspaceId, "/api/ide/fs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, op, ...params }),
        });
      } catch (cause) {
        throw providerWideError("Io", `bridge unreachable: ${String(cause)}`);
      }
      if (result.kind !== "response" || result.response.status !== 429 || attempt >= THROTTLE_WAITS_MS.length) break;
      await deps.sleep(THROTTLE_WAITS_MS[attempt]);
    }
    if (result.kind === "unavailable") throw providerWideError("Unsupported", `bridge unavailable (${result.reason})`);
    const response = result.response;
    const fail = PROVIDER_WIDE.has(response.status) ? providerWideError : (code: FsErrorCode, detail: string) => fsError(code, undefined, detail);
    if (response.status === 401 || response.status === 403) throw fail("PermissionDenied", `bridge ${response.status}`);
    if (response.status === 404) throw fail("Unsupported", "IDE sandbox is not enabled");
    if (response.status === 409) throw fail("Io", "no running sandbox");
    if (!response.ok) throw fail("Io", `bridge ${response.status}`);
    const body = (await response.json()) as { exitCode?: number | null; output?: string };
    return { exitCode: body.exitCode ?? 1, output: String(body.output ?? "") };
  };
}
