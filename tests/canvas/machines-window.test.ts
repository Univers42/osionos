// One click opens the person's own machine (own-machines plan §6): the window opens inside the
// click, the app answers its hello, checks the identity, mints and posts the session; a second
// click shows the open window instead of a second one; a step-up pauses and retry resumes.
import test from "node:test";
import assert from "node:assert/strict";

import type { Machine } from "../../src/features/machines/api/machinesApi.ts";
import { createMachineWindow, machineWindowUrl } from "../../src/features/machines/model/machineWindow.ts";

const LAPTOP: Machine = {
  id: "m-abcdefghijklmnop", name: "laptop", platform: "linux-x64", fingerprint: "ABCD-EFGH-IJKL-MNOP",
  isDefault: true, online: true, ideOrigin: "http://127.0.0.1:4100", lastSeenAt: null,
};
const NONCE = "n".repeat(22);
const SIG = "s".repeat(86);

function world({ blocked = false, mint = { kind: "ok", token: "osionos_mc1.abcdefgh.p.s" } as const } = {}) {
  const posted: Array<{ message: unknown; origin: string }> = [];
  const opened: Array<{ url: string; name: string }> = [];
  const phases: string[] = [];
  let handler: ((event: { data: unknown; origin: string; source: unknown }) => void) | null = null;
  let mints = 0;
  const win = { closed: false, focused: 0, focus() { this.focused++; }, postMessage(message: unknown, origin: string) { posted.push({ message, origin }); } };
  const controller = createMachineWindow({
    openWindow: (url, name) => { opened.push({ url, name }); return blocked ? null : win; },
    listen: (next) => { handler = next; return () => { handler = null; }; },
    mint: async () => { mints++; return mints === 1 ? mint : { kind: "ok", token: "osionos_mc1.abcdefgh.p.s" }; },
    verify: async () => "ok",
    nonce: () => NONCE,
    onPhase: (phase) => phases.push(phase),
  });
  const fromWindow = (data: unknown) => handler?.({ data, origin: LAPTOP.ideOrigin as string, source: win });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { controller, win, posted, opened, phases, fromWindow, settle, mints: () => mints };
}

test("the window opens on the machine's home, named for the machine", () => {
  assert.equal(machineWindowUrl(LAPTOP, null), "http://127.0.0.1:4100/?node=m-abcdefghijklmnop");
  assert.equal(machineWindowUrl(LAPTOP, "/home/me/p"), "http://127.0.0.1:4100/?node=m-abcdefghijklmnop&folder=%2Fhome%2Fme%2Fp");
  const w = world();
  assert.equal(w.controller.open(LAPTOP), "opened");
  assert.deepEqual(w.opened, [{ url: "http://127.0.0.1:4100/?node=m-abcdefghijklmnop", name: "osionos-machine-m-abcdefghijklmnop" }]);
});

test("one click carries the whole handshake: hello, identity, mint, session", async () => {
  const w = world();
  w.controller.open(LAPTOP);
  w.fromWindow({ type: "osionos-ide/ready", node: LAPTOP.id });
  await w.settle();
  assert.deepEqual(w.posted[0], { message: { type: "osionos-ide/hello", nonce: NONCE }, origin: LAPTOP.ideOrigin });
  w.fromWindow({ type: "osionos-ide/identity", machineId: LAPTOP.id, sig: SIG });
  await w.settle(); await w.settle();
  assert.deepEqual(w.posted[1], { message: { type: "osionos-ide/session", token: "osionos_mc1.abcdefgh.p.s" }, origin: LAPTOP.ideOrigin });
  w.fromWindow({ type: "osionos-ide/state", state: "connected" });
  assert.equal(w.phases.at(-1), "connected");
});

test("a second click shows the open window; a closed one is opened again", () => {
  const w = world();
  w.controller.open(LAPTOP);
  assert.equal(w.controller.open(LAPTOP), "focused");
  assert.equal(w.win.focused, 1);
  assert.equal(w.opened.length, 1);
  w.win.closed = true;
  assert.equal(w.controller.open(LAPTOP), "opened");
  assert.equal(w.opened.length, 2);
});

test("a blocked popup reads as an error, never as open", () => {
  const w = world({ blocked: true });
  assert.equal(w.controller.open(LAPTOP), "blocked");
  assert.equal(w.phases.at(-1), "error");
});

test("a step-up pauses the handshake and retry resumes it with a new hello", async () => {
  const w = world({ mint: { kind: "step-up" } });
  w.controller.open(LAPTOP);
  w.fromWindow({ type: "osionos-ide/ready", node: LAPTOP.id });
  await w.settle();
  w.fromWindow({ type: "osionos-ide/identity", machineId: LAPTOP.id, sig: SIG });
  await w.settle(); await w.settle();
  assert.equal(w.phases.at(-1), "step-up");
  w.controller.retry();
  await w.settle();
  assert.equal(w.posted.filter((p) => (p.message as { type: string }).type === "osionos-ide/hello").length, 2);
});
