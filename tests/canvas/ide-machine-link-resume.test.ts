// The app's half of "remember this computer" (devil verdict 2026-11-01, Amendment 1, R2, R11): a page
// that says `remembered` before its ready, or asks `need-resume`, gets a resume assertion minted after
// the same identity check and with no step-up; any failure there falls back to the token path with a
// fresh identity check, so a remembered computer is never stuck.
import assert from "node:assert/strict";
import test from "node:test";

import { linkMachineFrame, type MintMode, type MintResult } from "../../src/features/ide/vscode/machineLink.ts";

const NODE = "http://127.0.0.1:4100";
const TOKEN = "osionos_mc1.abcdefgh.payload.sig";
const RESUME = "osionos_mr1.abcdefgh.payload.sig";
const MACHINE = "m-abcdefghijklmnop";
const SIG = "s".repeat(86);

function world(answer: (mode: MintMode) => MintResult) {
  const posted: unknown[] = [];
  const states: string[] = [];
  const modes: MintMode[] = [];
  let nonces = 0;
  let handler: (event: { data: unknown; origin: string; source: unknown }) => void = () => {};
  const frame = { postMessage: (message: unknown) => posted.push(message) };
  linkMachineFrame({
    frame: () => frame, ideOrigin: NODE,
    listen: (next) => { handler = next; return () => {}; },
    mint: async (mode) => { modes.push(mode); return answer(mode); },
    onState: (state) => states.push(state),
    identity: { machineId: MACHINE, nonce: () => `${"n".repeat(21)}${++nonces}`, verify: async () => "ok" },
  });
  const deliver = (data: unknown) => handler({ data, origin: NODE, source: frame });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const answerHellos = async () => {
    for (let round = 0; round < 4; round += 1) {
      await settle();
      if (posted.at(-1) && (posted.at(-1) as { type: string }).type === "osionos-ide/hello") deliver({ type: "osionos-ide/identity", machineId: MACHINE, sig: SIG });
    }
    await settle();
  };
  return { posted, states, modes, deliver, answerHellos, nonces: () => nonces };
}

const ok = (mode: MintMode): MintResult => (mode === "resume" ? { kind: "resume", assertion: RESUME } : { kind: "ok", token: TOKEN });

test("R2: a page that said remembered gets a resume assertion after the identity check, with no step-up", async () => {
  const w = world(ok);
  w.deliver({ type: "osionos-ide/remembered" });
  w.deliver({ type: "osionos-ide/ready", node: MACHINE });
  await w.answerHellos();
  assert.deepEqual(w.modes, ["resume"]);
  assert.deepEqual(w.posted.at(-1), { type: "osionos-ide/resume", assertion: RESUME });
  assert.equal(w.states.includes("step-up"), false);
});

test("a page that said nothing is minted a token, as before; need-resume asks for an assertion", async () => {
  const w = world(ok);
  w.deliver({ type: "osionos-ide/ready", node: MACHINE });
  await w.answerHellos();
  w.deliver({ type: "osionos-ide/need-resume" });
  await w.answerHellos();
  assert.deepEqual(w.modes, ["token", "resume"]);
});

test("R11: a resume the bridge refuses or cannot answer falls back to the token path, with a fresh identity check", async () => {
  for (const refusal of [{ kind: "unavailable", reason: "not_found" }, { kind: "unavailable", reason: "error" }] as MintResult[]) {
    const w = world((mode) => (mode === "resume" ? refusal : { kind: "step-up" }));
    w.deliver({ type: "osionos-ide/remembered" });
    w.deliver({ type: "osionos-ide/ready", node: MACHINE });
    await w.answerHellos();
    assert.deepEqual(w.modes, ["resume", "token"]);
    assert.equal(w.nonces(), 2, "each mint has its own identity check");
    assert.equal(w.states.at(-1), "step-up", "the person is asked for the emailed code, never left on Connecting");
    assert.equal(w.posted.some((message) => (message as { type: string }).type === "osionos-ide/refused"), false);
  }
});

test("R12: the page's own ask while a resume is in flight mints nothing more: no token, so no emailed code", async () => {
  const w = world(ok);
  w.deliver({ type: "osionos-ide/remembered" });
  w.deliver({ type: "osionos-ide/ready", node: MACHINE });
  w.deliver({ type: "osionos-ide/need-session" });
  await w.answerHellos();
  assert.deepEqual(w.modes, ["resume"]);
});
