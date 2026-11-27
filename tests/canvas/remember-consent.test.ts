// "Remember this computer" for the editor and the dock terminal (devil verdict 2026-11-27 trusted
// browser, TB5; ADR 0041 R6): a token minted after a step-up carries remember only when that step-up
// showed the box and it is checked, and the box says what it unlocks and for how long.
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

/** The dock terminal's live wiring against a stubbed bridge: returns the body of every /token mint. */
async function terminalMints(drive: (node: { send(data: unknown): Promise<void> }) => Promise<void>, firstMintSteps = false): Promise<unknown[]> {
  await import("./support/emails-env.ts");
  const { withBridge } = await import("./support/stub-bridge.ts");
  const { startTerminalFrame, useTerminalFrameStore } = await import("../../src/features/machines/model/terminalFrameStore.ts");
  const { useMachinesStore } = await import("../../src/features/machines/model/machinesStore.ts");
  useMachinesStore.setState({ machines: [LAPTOP] });
  useTerminalFrameStore.setState({ remember: true });
  const frame = { postMessage() {} };
  let handler: (event: unknown) => void = () => {};
  Reflect.set(globalThis, "addEventListener", (_type: string, next: (event: unknown) => void) => { handler = next; });
  Reflect.set(globalThis, "removeEventListener", () => {});
  let mints = 0;
  const calls = await withBridge(
    (call) => {
      if (!call.url.endsWith("/token")) return { body: {} };
      mints += 1;
      if (firstMintSteps && mints === 1) return { status: 403, body: { code: "sudo_required" } };
      return { body: { token: "osionos_mc1.abcdefgh.payload.sig", exp: 4102444800 } };
    },
    async () => {
      const stop = startTerminalFrame({ frame: () => frame as never, probeOldNode: async () => false, colors: () => ({}) as never, onConnected: () => {} });
      await drive({ send: async (data) => { handler({ data, origin: NODE, source: frame }); await new Promise((resolve) => setTimeout(resolve, 0)); } });
      stop();
    },
  );
  return calls.filter((call) => call.url.endsWith("/token")).map((call) => call.body);
}

test("R6: a terminal mint with no step-up, as right after a code was confirmed elsewhere, mints remember: false", async () => {
  const bodies = await terminalMints(async (node) => {
    await node.send({ type: "osionos-ide/ready", node: MACHINE });
    await node.send({ type: "osionos-ide/identity", machineId: MACHINE, sig: SIG });
  });
  assert.deepEqual(bodies, [{}], "the box was never shown, so its default-on state is not consent");
});

test("R6: the terminal's step-up mints remember only when that step-up showed its box", async () => {
  const { terminalRemember } = await import("../../src/features/machines/model/terminalFrameStore.ts");
  const { useSudoPromptStore } = await import("../../src/features/settings/ui/sudo/sudoPromptModel.ts");
  for (const showBox of [false, true]) {
    const bodies = await terminalMints(async (node) => {
      await node.send({ type: "osionos-ide/ready", node: MACHINE });
      await node.send({ type: "osionos-ide/identity", machineId: MACHINE, sig: SIG });
      if (showBox) terminalRemember.shown();
      useSudoPromptStore.getState().granted();
      await node.send({ type: "osionos-ide/identity", machineId: MACHINE, sig: SIG });
    }, true);
    assert.deepEqual(bodies, [{}, showBox ? { remember: true } : {}]);
  }
});
