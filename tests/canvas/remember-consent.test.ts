// "Remember this computer" for the editor (devil verdict 2026-11-27 trusted browser, TB5; ADR 0041
// R6): a token minted after an editor step-up carries remember only when that step-up showed the box
// and it is checked, and the box says what it unlocks and for how long.
import assert from "node:assert/strict";
import test from "node:test";

import { createRememberConsent, REMEMBER_HINT } from "../../src/features/machines/model/rememberConsent.ts";
import { createTerminalFrame } from "../../src/features/machines/model/terminalFrame.ts";
import type { Machine } from "../../src/features/machines/api/machinesApi.ts";

const NODE = "http://127.0.0.1:4100";
const MACHINE = "m-abcdefghijklmnop";
const LAPTOP = { id: MACHINE, name: "laptop", online: true, isDefault: true } as Machine;
const TOKEN = "osionos_mc1.abcdefgh.payload.sig";
const SIG = "s".repeat(86);

/** An editor frame whose first mint needs a step-up; every mint records the remember it carried. */
function editorFrame(checked: () => boolean) {
  const consent = createRememberConsent(checked);
  const minted: boolean[] = [];
  const frame = { postMessage() {} };
  let handler: (event: { data: unknown; origin: string; source: unknown }) => void = () => {};
  const controller = createTerminalFrame({
    frame: () => frame,
    listen: (next) => { handler = next; return () => {}; },
    lookup: async () => LAPTOP,
    mint: async () => {
      minted.push(consent.remember());
      return (minted.length === 1 ? { kind: "step-up" } : { kind: "ok", token: TOKEN }) as never;
    },
    verify: async () => "ok" as never,
    nonce: () => `nonce-${"x".repeat(20)}`,
    schedule: () => () => {},
    colors: () => ({}),
    localNetwork: async () => "granted" as never,
    probeOldNode: async () => false,
    onPhase: consent.onPhase,
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    consent, minted, controller, settle,
    async handshake() {
      handler({ data: { type: "osionos-ide/ready", node: MACHINE }, origin: NODE, source: frame });
      await settle();
      await this.identify();
    },
    /** Answers the hello every mint is preceded by. */
    async identify() {
      handler({ data: { type: "osionos-ide/identity", machineId: MACHINE, sig: SIG }, origin: NODE, source: frame });
      await settle();
    },
  };
}

test("TB5: a step-up without the box mints remember: false, even with the box's state checked", async () => {
  const w = editorFrame(() => true);
  await w.handshake();
  await w.controller.retry();
  await w.identify();
  assert.deepEqual(w.minted, [false, false]);
});

test("TB5: a step-up that showed the box mints remember only while it is checked", async () => {
  for (const checked of [true, false]) {
    const w = editorFrame(() => checked);
    await w.handshake();
    w.consent.shown();
    await w.controller.retry();
    await w.identify();
    assert.deepEqual(w.minted, [false, checked]);
  }
});

test("TB5: the box shown in one step-up is not consent for a later mint", () => {
  const consent = createRememberConsent(() => true);
  consent.onPhase("step-up");
  consent.shown();
  assert.equal(consent.remember(), true);
  assert.equal(consent.remember(), false, "one mint per showing");
  consent.shown();
  consent.onPhase("step-up");
  assert.equal(consent.remember(), false, "a new step-up has not shown the box yet");
});

test("TB5: the box names files and the terminal, the 12 h / 30 d window, and the shared-computer warning", () => {
  assert.match(REMEMBER_HINT, /files/i);
  assert.match(REMEMBER_HINT, /terminal/i);
  assert.match(REMEMBER_HINT, /12 hours/);
  assert.match(REMEMBER_HINT, /30 days at most/);
  assert.match(REMEMBER_HINT, /Don't check this on a shared computer\.$/);
});
