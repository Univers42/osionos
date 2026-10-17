// Capacity rules of the IDE sandbox broker: one running box per user (B2.4), a full plane
// answers 429 SANDBOX_BUSY with Retry-After (B2.5), a per-user box-create limit (B4.1), and
// the idle stop (B2.6). The fake docker is a shared "farm" so two opens really contend.
import test from "node:test";
import assert from "node:assert/strict";
import { ensureSandbox, shouldReapSandbox, isIdleExpired, reapExpiredSandboxes, SANDBOX_IDLE_MS } from "../../scripts/bridge-ide-sandbox.mjs";

const ENV = { OSIONOS_IDE_SANDBOX: "1", OSIONOS_IDE_DOCKER_HOST: "proxy:2375", OSIONOS_IDE_MAX_BOXES: "3" };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const hex = (n) => String(n).padStart(32, "0");
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const namesFor = (userId, n) => ({
  containerName: `ide-${hex(n)}`, volumeName: `osio-ide-vol-${hex(n)}`, homeVolumeName: `osio-ide-home-${userId.slice(0, 8)}`,
  digest: hex(n), userId, workspaceId: "22222222-2222-4222-8222-222222222222",
});

function farm(initial = []) {
  const boxes = new Map(initial.map((b) => [b.name, { ...b }]));
  const calls = [];
  let pendingOwner = null;
  return {
    boxes, calls,
    runningNames: () => [...boxes.values()].filter((b) => b.running).map((b) => b.name),
    docker: {
      async inspect(name) { await tick(); const b = boxes.get(name); return b && { Created: new Date().toISOString(), Config: { Labels: { "osio.ide.uid": "20000" } }, State: { Running: b.running, FinishedAt: "0001-01-01T00:00:00Z" } }; },
      async remove(name) { calls.push(`remove:${name}`); boxes.delete(name); },
      async ensureVolume() { await tick(); },
      async allocateUid() { await tick(); return 20000; },
      async waitStopped() { await tick(); return 0; },
      async create(name, spec) {
        await tick();
        if (name.startsWith("ideinit-")) return;
        pendingOwner = spec?.Labels?.["osio.ide.owner"];
        boxes.set(name, { name, owner: pendingOwner, running: false });
      },
      async start(name) { await tick(); const b = boxes.get(name); if (b) b.running = true; },
      async stop(name) { calls.push(`stop:${name}`); await tick(); const b = boxes.get(name); if (b) b.running = false; },
      async listManaged() {
        await tick();
        return [...boxes.values()].map((b) => ({ Names: [`/${b.name}`], State: b.running ? "running" : "exited", Labels: { "osio.ide.owner": b.owner } }));
      },
    },
  };
}
const env = (extra = {}) => ({ ...ENV, ...extra });
const open = (f, userId, n, opts = {}, e = ENV) => ensureSandbox(e, namesFor(userId, n), { docker: f.docker, ...opts });

test("B2.4: two concurrent opens of two workspaces leave exactly one running box, and stop (never remove) the first", async () => {
  const f = farm();
  const results = await Promise.all([open(f, USER_A, 1, {}, env({ OSIONOS_IDE_CREATES_PER_USER_HOUR: "50" })), open(f, USER_A, 2, {}, env({ OSIONOS_IDE_CREATES_PER_USER_HOUR: "50" }))]);
  assert.equal(f.runningNames().length, 1);
  assert.equal(f.boxes.size, 2, "the stopped box still exists");
  assert.ok(!f.calls.some((c) => c.startsWith("remove:ide-")), "no box was removed");
  assert.equal(results.filter((r) => r.stoppedOtherWorkspaces === 1).length, 1, "exactly one open reports it stopped the other");
});

test("B2.4: another owner's running box is never touched", async () => {
  const f = farm([{ name: `ide-${hex(90)}`, owner: USER_B, running: true }]);
  await open(f, USER_A, 3, {}, env({ OSIONOS_IDE_CREATES_PER_USER_HOUR: "50" }));
  assert.ok(f.runningNames().includes(`ide-${hex(90)}`));
  assert.ok(!f.calls.includes(`stop:ide-${hex(90)}`));
});

test("B2.4: a passive caller (LSP/fs-sync) never stops the owner's other workspace", async () => {
  const f = farm([{ name: `ide-${hex(91)}`, owner: USER_A, running: true }]);
  await assert.rejects(() => open(f, USER_A, 4, { passive: true }, env({ OSIONOS_IDE_CREATES_PER_USER_HOUR: "50" })), (e) => e.code === "OTHER_WORKSPACE_RUNNING" && e.status === 409);
  assert.deepEqual(f.calls, []);
});

test("B2.5: a full plane is 429 SANDBOX_BUSY with retryAfterSec 60 and creates nothing", async () => {
  const f = farm([1, 2, 3].map((i) => ({ name: `ide-${hex(80 + i)}`, owner: USER_B, running: true })));
  await assert.rejects(() => open(f, USER_A, 5, {}, env({ OSIONOS_IDE_CREATES_PER_USER_HOUR: "50" })),
    (e) => e.status === 429 && e.code === "SANDBOX_BUSY" && e.retryAfterSec === 60 && e.message === "All sandboxes are busy, retry in a minute");
  assert.equal(f.boxes.size, 3);
});

test("B4.1: the 7th box create of one user in an hour is 429 CREATE_RATE with a Retry-After", async () => {
  const f = farm();
  const e = env({ OSIONOS_IDE_MAX_BOXES: "10" });
  for (let i = 0; i < 6; i += 1) await open(f, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", 10 + i, {}, e);
  await assert.rejects(() => open(f, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", 20, {}, e), (err) => err.status === 429 && err.code === "CREATE_RATE" && err.retryAfterSec > 0);
  assert.equal(f.boxes.size, 6, "the refused create made nothing");
});

test("B2.6: idle expiry needs not-running false, no activity, and a full idle window since creation", () => {
  const now = 10_000_000;
  const old = (now - SANDBOX_IDLE_MS - 1) / 1000;
  assert.equal(isIdleExpired({ running: true, createdSec: old }, now, SANDBOX_IDLE_MS, false, 0), true);
  assert.equal(isIdleExpired({ running: true, createdSec: old }, now, SANDBOX_IDLE_MS, true, 0), false, "active");
  assert.equal(isIdleExpired({ running: false, createdSec: old }, now, SANDBOX_IDLE_MS, false, 0), false, "already stopped");
  assert.equal(isIdleExpired({ running: true, createdSec: now / 1000 }, now, SANDBOX_IDLE_MS, false, 0), false, "just created");
  assert.equal(isIdleExpired({ running: true, createdSec: old }, now, SANDBOX_IDLE_MS, false, now - 1000), false, "grace after a bridge restart");
  assert.equal(SANDBOX_IDLE_MS, 20 * 60 * 1000);
  assert.equal(shouldReapSandbox({ running: true, createdSec: old }, now, 4 * 3600_000, 12 * 3600_000, false), false, "age caps unchanged");
});

test("B2.6: the sweep stops an idle box and leaves an active one", async () => {
  const now = Date.now();
  const created = Math.floor((now - SANDBOX_IDLE_MS - 60_000) / 1000);
  const f = farm();
  const dockerEnv = env();
  // reapExpiredSandboxes builds its own client; drive it through the injectable seam.
  f.boxes.set("ide-idle", { name: "ide-idle", owner: USER_A, running: true });
  f.boxes.set("ide-busy", { name: "ide-busy", owner: USER_A, running: true });
  const listed = [{ Names: ["/ide-idle"], State: "running", Created: created }, { Names: ["/ide-busy"], State: "running", Created: created }];
  const reaped = await reapExpiredSandboxes(dockerEnv, undefined, now, {
    docker: { listManaged: async () => listed, stop: async (name) => f.docker.stop(name) },
    isActive: (name) => name === "ide-busy", processStartedMs: 0,
  });
  assert.equal(reaped, 1);
  assert.deepEqual(f.calls, ["stop:ide-idle"]);
});

test("B2.5: the session route sends 429, Retry-After: 60 and code SANDBOX_BUSY; a stop of others is flagged", async () => {
  const { createIdeSandboxHandler } = await import("../../scripts/bridge-ide-sandbox.mjs");
  const WS = "22222222-2222-4222-8222-222222222222";
  const run = async (ensure) => {
    const sent = {};
    const response = { writeHead: (status, headers) => Object.assign(sent, { status, headers }), end: (body) => { sent.body = JSON.parse(body); } };
    const handler = createIdeSandboxHandler({
      config: { allowedOrigin: "*" }, verifySession: () => ({ userId: USER_A, workspaceIds: [WS] }),
      env: { ...ENV, OSIONOS_IDE_ALLOWED_SUBJECTS: USER_A }, ensure,
    });
    const request = { method: "POST", headers: { authorization: "Bearer x" }, [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify({ workspaceId: WS })); } };
    await handler(new URL("http://h/api/ide/session"), request, response);
    return sent;
  };
  const busy = await run(async () => { throw Object.assign(new Error("All sandboxes are busy, retry in a minute"), { status: 429, code: "SANDBOX_BUSY", retryAfterSec: 60 }); });
  assert.equal(busy.status, 429);
  assert.equal(busy.headers["retry-after"], "60");
  assert.equal(busy.body.code, "SANDBOX_BUSY");
  const stopped = await run(async () => ({ status: "running", reused: false, stoppedOtherWorkspaces: 1 }));
  assert.equal(stopped.body.stoppedOtherWorkspaces, 1);
});

test("B2.5: the owner's own running box does not count against a full plane, since it is stopped for the new one", async () => {
  const f = farm([{ name: `ide-${hex(70)}`, owner: USER_B, running: true }, { name: `ide-${hex(71)}`, owner: USER_B, running: true }, { name: `ide-${hex(72)}`, owner: USER_A, running: true }]);
  const result = await open(f, USER_A, 6, {}, env({ OSIONOS_IDE_CREATES_PER_USER_HOUR: "50" }));
  assert.equal(result.stoppedOtherWorkspaces, 1);
  assert.equal(f.runningNames().length, 3);
});

test("B2.6: a closed terminal counts as activity for the idle window only, and output alone is not activity", async () => {
  const { bumpContainerSockets, containerHasActivity, pruneActivity } = await import("../../scripts/ide-term-sessions.mjs");
  const name = "ide-idle-window";
  bumpContainerSockets(name, 1);
  assert.equal(containerHasActivity(name, SANDBOX_IDLE_MS), true, "a live socket");
  bumpContainerSockets(name, -1);
  const closedAt = Date.now();
  assert.equal(containerHasActivity(name, SANDBOX_IDLE_MS, closedAt + SANDBOX_IDLE_MS - 1000), true, "inside the window");
  assert.equal(containerHasActivity(name, SANDBOX_IDLE_MS, closedAt + SANDBOX_IDLE_MS + 1000), false, "past the window");
  pruneActivity(SANDBOX_IDLE_MS, closedAt + SANDBOX_IDLE_MS + 1000);
  assert.equal(containerHasActivity(name, SANDBOX_IDLE_MS, closedAt + 1), false, "pruned");
});
