// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ide-ensure-sandbox.test.mjs                        :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/09/17 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/09/17 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //
// ensureSandbox is now reached by the terminal, the session POST, AND the LSP/fs-sync
// sockets — which the IDE opens together. It must provision a stopped box once, not three
// times; must settle (not fail) when another process got there first; and a box the reaper
// stopped at its HARD lifetime cap must only come back on an explicit user action (a
// terminal or the session POST), or an open tab would keep it alive indefinitely.
import test from "node:test";
import assert from "node:assert/strict";
import { ensureSandbox, SANDBOX_HARD_MAX_MS } from "../../scripts/bridge-ide-sandbox.mjs";

const ENV = { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: "proxy:2375" };
const NEVER = "0001-01-01T00:00:00Z";
let seq = 0;
const names = () => {
  seq += 1;
  const hex = String(seq).padStart(32, "0");
  return {
    containerName: `ide-${hex}`, volumeName: `osio-ide-vol-${hex}`, digest: hex,
    userId: "11111111-1111-4111-8111-111111111111", workspaceId: "22222222-2222-4222-8222-222222222222",
  };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const iso = (ms) => new Date(ms).toISOString();

/** A fake docker client over one container; `state` null = absent. */
function fakeDocker(state, { createError = null, inspectOverrides = [] } = {}) {
  const calls = [];
  const view = () => state && { Created: iso(state.created), State: { Running: state.running, FinishedAt: state.finished } };
  return {
    calls,
    async inspect() { calls.push("inspect"); await tick(); return inspectOverrides.length ? inspectOverrides.shift() : view(); },
    async remove() { calls.push("remove"); await tick(); state = null; },
    async ensureVolume() { calls.push("volume"); await tick(); },
    async create() {
      calls.push("create");
      await tick();
      if (createError) throw createError;
      state = { created: Date.now(), running: false, finished: NEVER };
    },
    async start() { calls.push("start"); await tick(); if (state) state.running = true; },
  };
}
const count = (calls, name) => calls.filter((c) => c === name).length;
const stoppedAfter = (lifetimeMs) => {
  const created = Date.now() - lifetimeMs - 60_000;
  return { created, running: false, finished: iso(created + lifetimeMs) };
};

test("a running sandbox is reused untouched", async () => {
  const docker = fakeDocker({ created: Date.now(), running: true, finished: NEVER });
  assert.deepEqual(await ensureSandbox(ENV, names(), { docker }), { status: "running", reused: true });
  assert.equal(count(docker.calls, "create") + count(docker.calls, "remove"), 0);
});

test("concurrent callers provision a stopped sandbox exactly once", async () => {
  const docker = fakeDocker(stoppedAfter(60_000));
  const n = names();
  const results = await Promise.all([
    ensureSandbox(ENV, n, { docker, passive: true }),
    ensureSandbox(ENV, n, { docker, passive: true }),
    ensureSandbox(ENV, n, { docker }),
  ]);
  assert.equal(count(docker.calls, "remove"), 1);
  assert.equal(count(docker.calls, "create"), 1);
  assert.equal(count(docker.calls, "start"), 1);
  assert.ok(results.every((r) => r.status === "running"));
});

test("a failed provision rejects every waiting caller, and the next call tries again", async () => {
  const boom = Object.assign(new Error("create failed (500)"), { status: 500 });
  const failing = fakeDocker(null, { createError: boom });
  const n = names();
  const outcomes = await Promise.allSettled([ensureSandbox(ENV, n, { docker: failing }), ensureSandbox(ENV, n, { docker: failing })]);
  assert.deepEqual(outcomes.map((o) => o.status), ["rejected", "rejected"]);
  assert.equal(count(failing.calls, "create"), 1);
  const healthy = fakeDocker(null);
  assert.equal((await ensureSandbox(ENV, n, { docker: healthy })).status, "running");
});

test("an absent sandbox is created, even by the LSP/fs-sync path", async () => {
  const docker = fakeDocker(null);
  assert.deepEqual(await ensureSandbox(ENV, names(), { docker, passive: true }), { status: "running", reused: false });
  assert.equal(count(docker.calls, "create"), 1);
});

test("a sandbox idle-reaped before the hard cap comes back for the LSP/fs-sync path", async () => {
  const docker = fakeDocker(stoppedAfter(SANDBOX_HARD_MAX_MS / 2));
  assert.equal((await ensureSandbox(ENV, names(), { docker, passive: true })).status, "running");
});

test("a sandbox stopped at the hard cap stays down for LSP/fs-sync, but a terminal restarts it", async () => {
  const docker = fakeDocker(stoppedAfter(SANDBOX_HARD_MAX_MS));
  const n = names();
  await assert.rejects(ensureSandbox(ENV, n, { docker, passive: true }));
  assert.equal(count(docker.calls, "remove") + count(docker.calls, "create"), 0);
  assert.equal((await ensureSandbox(ENV, n, { docker })).status, "running");
  assert.equal(count(docker.calls, "create"), 1);
});

test("a terminal that joins a refused LSP provision still restarts the box", async () => {
  const docker = fakeDocker(stoppedAfter(SANDBOX_HARD_MAX_MS));
  const n = names();
  const [lsp, terminal] = await Promise.allSettled([
    ensureSandbox(ENV, n, { docker, passive: true }),
    ensureSandbox(ENV, n, { docker }),
  ]);
  assert.equal(lsp.status, "rejected");
  assert.equal(terminal.status, "fulfilled");
  assert.equal(count(docker.calls, "create"), 1);
});

test("another process creating the box first (409) is adopted, not an error", async () => {
  const conflict = Object.assign(new Error("create failed (409)"), { status: 409 });
  const docker = fakeDocker(null, { createError: conflict });
  assert.equal((await ensureSandbox(ENV, names(), { docker })).status, "running");
  assert.equal(count(docker.calls, "start"), 1);
});

test("a box another process restarted meanwhile is not force-removed", async () => {
  const running = { Created: iso(Date.now()), State: { Running: true, FinishedAt: NEVER } };
  const stopped = { Created: iso(Date.now() - 120_000), State: { Running: false, FinishedAt: iso(Date.now() - 60_000) } };
  const docker = fakeDocker(null, { inspectOverrides: [stopped, running] });
  assert.deepEqual(await ensureSandbox(ENV, names(), { docker }), { status: "running", reused: true });
  assert.equal(count(docker.calls, "remove"), 0);
});
