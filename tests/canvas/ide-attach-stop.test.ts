/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-attach-stop.test.ts                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// An attach over a 1 200-file tree against the real sandbox provider and bridge
// transport, the bridge answering 429 once its 120-request burst is spent. The
// walk stops at the first provider-wide failure instead of sending every
// remaining file's read into it, five requests each through the 429 retries.
import assert from "node:assert/strict";
import test from "node:test";

import { ATTACH_PAGE_FILES, reconcileOnAttach, STOPPED_REASON } from "../../src/features/ide/model/reconcileOnAttach.ts";
import { sandboxHashes } from "../../src/features/ide/vfs/sandboxFsOps.ts";
import { createSandboxProvider } from "../../src/features/ide/vfs/sandboxProvider.ts";
import { bridgeFsTransport, type BridgeFsDeps } from "../../src/features/ide/vfs/bridgeTransport.ts";

const FILES = 1200;
const BURST = 120;
const RETRIES = 4;
const IN_FLIGHT = 8;

/** A bridge that answers `ok` for the first `burst` requests, then `status` forever. */
function bridge(burst: number, status: number) {
  let requests = 0;
  const deps: BridgeFsDeps = {
    fetch: async () => {
      requests += 1;
      const ok = requests <= burst;
      return { kind: "response", response: new Response(ok ? JSON.stringify({ exitCode: 0, output: "" }) : "{}", { status: ok ? 200 : status }) };
    },
    sleep: async () => undefined,
  };
  return { transport: bridgeFsTransport("ws-stop", deps), requests: () => requests };
}

const desired = Array.from({ length: FILES }, (_, i) => ({ path: `src/f${i}.c`, content: `int f${i};` }));

async function attachOver(b: ReturnType<typeof bridge>) {
  return reconcileOnAttach({
    workspaceId: `ws-stop-${Math.random()}`, desired, provider: createSandboxProvider("sandbox", b.transport),
    theirsHashes: (paths) => sandboxHashes(b.transport, paths), maxConcurrent: IN_FLIGHT,
  });
}

test("a 429 past the retries stops the walk: only the files in flight meet it", async (t) => {
  const b = bridge(BURST, 429);
  const report = await attachOver(b);
  t.diagnostic(`${b.requests()} bridge requests`); // 5 535 before the stop (2026-10-14)
  assert.ok(b.requests() <= BURST + IN_FLIGHT * (RETRIES + 1), `${b.requests()} requests`);
  const stopped = report.skipped.filter((skip) => skip.reason.startsWith(STOPPED_REASON));
  assert.ok(stopped.length >= FILES - BURST, `${stopped.length} stopped`);
  assert.match(stopped[0].reason, /bridge 429/);
  assert.equal(report.skipped.length + report.conflicts.length + report.written.length + report.recorded.length, FILES);
});

test("a hashes call refused from the start costs one call and reads nothing", async () => {
  const b = bridge(0, 409);
  const report = await attachOver(b);
  assert.equal(b.requests(), 1);
  assert.equal(report.skipped.length, FILES);
  assert.ok(report.skipped.every((skip) => skip.reason === `${STOPPED_REASON} (Io: no running sandbox)`));
});

test("a failure that can belong to one op (500) is that file's alone: the walk goes on", async () => {
  const b = bridge(1, 500);
  const report = await attachOver(b);
  assert.equal(report.skipped.length, FILES);
  assert.ok(report.skipped.every((skip) => skip.reason === "Io: bridge 500"), "never called stopped");
  assert.equal(b.requests(), Math.ceil(FILES / ATTACH_PAGE_FILES) + FILES, "every page's hashes and every file were still tried");
});
