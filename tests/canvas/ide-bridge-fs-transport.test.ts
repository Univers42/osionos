/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-bridge-fs-transport.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";

import { bridgeFsTransport, type BridgeFsDeps } from "../../src/features/ide/vfs/bridgeTransport.ts";
import { isFsError } from "../../src/features/ide/vfs/errors.ts";

// The bridge's ide-fs bucket answers 429 once a burst passes 120 requests; a
// 500-file attach met it and every op past the burst failed as "bridge 429".

/** A bridge answering `statuses` in turn (the last one repeats), logging each wait. */
function scripted(statuses: number[]): { deps: BridgeFsDeps; calls: () => number; waits: number[] } {
  let calls = 0;
  const waits: number[] = [];
  const deps: BridgeFsDeps = {
    fetch: async () => {
      const status = statuses[Math.min(calls, statuses.length - 1)];
      calls += 1;
      const body = status === 200 ? JSON.stringify({ exitCode: 0, output: "ok" }) : "{}";
      return { kind: "response", response: new Response(body, { status }) };
    },
    sleep: async (ms) => { waits.push(ms); },
  };
  return { deps, calls: () => calls, waits };
}

test("bridge fs: a throttled op waits and is sent again, and its result comes back", async () => {
  const bridge = scripted([429, 429, 200]);
  const result = await bridgeFsTransport("ws", bridge.deps)("read", { path: "a.c" });
  assert.deepEqual(result, { exitCode: 0, output: "ok" });
  assert.equal(bridge.calls(), 3);
  assert.deepEqual(bridge.waits, [250, 500]);
});

test("bridge fs: still throttled after four waits (3.75 s) is an Io error naming the 429", async () => {
  const bridge = scripted([429]);
  await assert.rejects(bridgeFsTransport("ws", bridge.deps)("read", { path: "a.c" }), (error) => isFsError(error) && error.code === "Io" && /429/.test(error.message));
  assert.equal(bridge.calls(), 5);
  assert.deepEqual(bridge.waits, [250, 500, 1000, 2000]);
});

test("bridge fs: any other failure is not retried", async () => {
  for (const status of [403, 404, 409, 500]) {
    const bridge = scripted([status, 200]);
    await assert.rejects(bridgeFsTransport("ws", bridge.deps)("read", { path: "a.c" }));
    assert.equal(bridge.calls(), 1, `status ${status}`);
  }
});
