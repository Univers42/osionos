// One click opens this computer's own node (2026-11-01): the window opens inside the click on
// http://127.0.0.1:4100/?local=1 with no machine chosen up front; the node names itself in ready,
// the app checks it against the account's list, then hello, identity, mint and session. A second
// click shows the window already open; no ready in time closes the window and says no node runs.
import test from "node:test";
import assert from "node:assert/strict";

import type { Machine } from "../../src/features/machines/api/machinesApi.ts";
import { LOCAL_NODE_ORIGIN, READY_TIMEOUT_MS, createMachineWindow, localWindowUrl } from "../../src/features/machines/model/machineWindow.ts";

const LAPTOP: Machine = {
  id: "m-abcdefghijklmnop", name: "laptop", platform: "linux-x64", fingerprint: "ABCD-EFGH-IJKL-MNOP",
  isDefault: true, online: true, ideOrigin: "http://127.0.0.1:4100", lastSeenAt: null,
};
const NONCE = "n".repeat(22);
const SIG = "s".repeat(86);
const MC1 = "osionos_mc1.abcdefgh.p.s";

type Lookup = Machine | "other-account" | "unavailable";

function world({ blocked = false, mint = { kind: "ok", token: MC1 } as const, lookup = LAPTOP as Lookup, machines = [] as Machine[] | null } = {}) {
  const posted: Array<{ message: unknown; origin: string }> = [];
  const opened: Array<{ url: string; name: string }> = [];
  const phases: Array<{ phase: string; name: string | null }> = [];
  const minted: string[] = [];
  const verified: string[] = [];
  const looked: string[] = [];
  const timers: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  let handler: ((event: { data: unknown; origin: string; source: unknown }) => void) | null = null;
  const win = {
    closed: false, focused: 0,
    focus() { this.focused++; },
    close() { this.closed = true; },
    postMessage(message: unknown, origin: string) { posted.push({ message, origin }); },
  };
  const controller = createMachineWindow({
    openWindow: (url, name) => { opened.push({ url, name }); return blocked ? null : win; },
    listen: (next) => { handler = next; return () => { handler = null; }; },
    machines: () => machines,
    lookup: async (id) => { looked.push(id); return lookup; },
    mint: async (id) => { minted.push(id); return minted.length === 1 ? mint : { kind: "ok", token: MC1 }; },
    verify: async (id) => { verified.push(id); return "ok"; },
    nonce: () => NONCE,
    schedule: (fn, ms) => { const timer = { fn, ms, cancelled: false }; timers.push(timer); return () => { timer.cancelled = true; }; },
    onPhase: (phase, machine) => phases.push({ phase, name: machine?.name ?? null }),
  });
  const fromWindow = (data: unknown) => handler?.({ data, origin: LOCAL_NODE_ORIGIN, source: win });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const expire = () => { for (const timer of timers) if (!timer.cancelled) timer.fn(); };
  const last = () => phases.at(-1)?.phase;
  return { controller, win, posted, opened, phases, minted, verified, looked, timers, fromWindow, settle, expire, last };
}

test("the window opens this computer's node, with no machine id in the address", () => {
  assert.equal(LOCAL_NODE_ORIGIN, "http://127.0.0.1:4100");
  assert.equal(localWindowUrl(), "http://127.0.0.1:4100/?local=1");
  const w = world();
  assert.equal(w.controller.open(), "opened");
  assert.deepEqual(w.opened, [{ url: "http://127.0.0.1:4100/?local=1", name: "osionos-machine-local" }]);
  assert.equal(w.last(), "connecting");
});

// A node installed before local=1 serves a page that reads only `node`; without it, it never sends
// ready. The app names the account's machine for it; the claim and identity checks still decide.
test("with a machine on the account the address also names it, for nodes installed before local=1", () => {
  assert.equal(localWindowUrl(LAPTOP.id), `http://127.0.0.1:4100/?local=1&node=${LAPTOP.id}`);
  const w = world({ machines: [LAPTOP] });
  w.controller.open();
  assert.deepEqual(w.opened, [{ url: `http://127.0.0.1:4100/?local=1&node=${LAPTOP.id}`, name: "osionos-machine-local" }]);
  for (const machines of [[], null]) {
    const none = world({ machines });
    none.controller.open();
    assert.equal(none.opened[0].url, "http://127.0.0.1:4100/?local=1", String(machines));
  }
});

test("a node naming another machine than the hint is still checked by its own id", async () => {
  const w = world({ machines: [LAPTOP], lookup: "other-account" });
  w.controller.open();
  w.fromWindow({ type: "osionos-ide/ready", node: "m-zzzzzzzzzzzzzzzz" });
  await w.settle(); await w.settle();
  assert.deepEqual(w.looked, ["m-zzzzzzzzzzzzzzzz"]);
  assert.equal(w.last(), "other-account");
  assert.deepEqual(w.minted, []);
});

test("one click carries the whole handshake for the machine the node names", async () => {
  const w = world();
  w.controller.open();
  w.fromWindow({ type: "osionos-ide/ready", node: LAPTOP.id });
  await w.settle(); await w.settle();
  assert.deepEqual(w.posted[0], { message: { type: "osionos-ide/hello", nonce: NONCE }, origin: LOCAL_NODE_ORIGIN });
  w.fromWindow({ type: "osionos-ide/identity", machineId: LAPTOP.id, sig: SIG });
  await w.settle(); await w.settle();
  assert.deepEqual(w.verified, [LAPTOP.id]);
  assert.deepEqual(w.minted, [LAPTOP.id]);
  assert.deepEqual(w.posted[1], { message: { type: "osionos-ide/session", token: MC1 }, origin: LOCAL_NODE_ORIGIN });
  w.fromWindow({ type: "osionos-ide/state", state: "connected" });
  assert.deepEqual(w.phases.at(-1), { phase: "connected", name: "laptop" });
});

test("a node paired to another account reaches the panel and the page, and nothing is minted", async () => {
  const w = world({ lookup: "other-account" });
  w.controller.open();
  w.fromWindow({ type: "osionos-ide/ready", node: LAPTOP.id });
  await w.settle(); await w.settle();
  assert.equal(w.last(), "other-account");
  assert.deepEqual(w.posted, [{ message: { type: "osionos-ide/refused", reason: "other-account" }, origin: LOCAL_NODE_ORIGIN }]);
  assert.deepEqual(w.minted, []);
});

test("no ready before the deadline: the panel says no node runs, and the window is closed", () => {
  const w = world();
  w.controller.open();
  assert.deepEqual(w.timers.map((timer) => timer.ms), [READY_TIMEOUT_MS]);
  w.expire();
  assert.equal(w.last(), "no-node");
  assert.equal(w.win.closed, true);
});

test("a ready in time keeps the window open past the deadline", async () => {
  const w = world();
  w.controller.open();
  w.fromWindow({ type: "osionos-ide/ready", node: LAPTOP.id });
  await w.settle();
  w.expire();
  assert.notEqual(w.last(), "no-node");
  assert.equal(w.win.closed, false);
});

test("a second click shows the open window; a closed one is opened again", () => {
  const w = world();
  w.controller.open();
  assert.equal(w.controller.open(), "focused");
  assert.equal(w.win.focused, 1);
  assert.equal(w.opened.length, 1);
  w.win.closed = true;
  assert.equal(w.controller.open(), "opened");
  assert.equal(w.opened.length, 2);
});

test("a blocked popup reads as an error, never as open", () => {
  const w = world({ blocked: true });
  assert.equal(w.controller.open(), "blocked");
  assert.equal(w.last(), "error");
});

test("a step-up pauses the handshake and retry resumes it with a new hello", async () => {
  const w = world({ mint: { kind: "step-up" } });
  w.controller.open();
  w.fromWindow({ type: "osionos-ide/ready", node: LAPTOP.id });
  await w.settle(); await w.settle();
  w.fromWindow({ type: "osionos-ide/identity", machineId: LAPTOP.id, sig: SIG });
  await w.settle(); await w.settle();
  assert.equal(w.last(), "step-up");
  w.controller.retry();
  await w.settle();
  assert.equal(w.posted.filter((p) => (p.message as { type: string }).type === "osionos-ide/hello").length, 2);
});
