import test from "node:test";
import assert from "node:assert/strict";

import { restartSandbox } from "../../src/features/ide/model/restartSandbox.ts";

const WS = "22222222-2222-4222-8222-222222222222";

test("restart sends DELETE /api/ide/session with the workspace id and reports success", async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const ok = await restartSandbox(WS, async (_ws, path, init) => {
    calls.push({ path, init });
    return { kind: "response", response: new Response("{}", { status: 200 }) };
  });
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/ide/session");
  assert.equal(calls[0].init?.method, "DELETE");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { workspaceId: WS });
});

test("restart reports failure for an unavailable IDE, a 502 and a thrown fetch", async () => {
  assert.equal(await restartSandbox(WS, async () => ({ kind: "unavailable", reason: "error" })), false);
  assert.equal(await restartSandbox(WS, async () => ({ kind: "response", response: new Response("{}", { status: 502 }) })), false);
  assert.equal(await restartSandbox(WS, async () => { throw new Error("network"); }), false);
});
