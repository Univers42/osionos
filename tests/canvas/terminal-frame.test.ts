// The web dock's terminal frame (devil verdict 2026-11-01, W11, W14; groot ADR 0041). The app talks
// to the node's terminal page only through that frame's window and the node's exact origin, checks
// the machine's identity before every token, and explains a frame that never answers in plain words
// (owner, 2026-11-01: no command in the dock).
import assert from "node:assert/strict";
import test from "node:test";

import { createTerminalFrame, terminalFramePanel, TERMINAL_PAGE_URL, type TerminalFramePhase } from "../../src/features/machines/model/terminalFrame.ts";
import type { Machine } from "../../src/features/machines/api/machinesApi.ts";

const NODE = "http://127.0.0.1:4100";
const MACHINE = "m-abcdefghijklmnop";
const LAPTOP = { id: MACHINE, name: "laptop", online: true, isDefault: true } as Machine;
const TOKEN = "osionos_mc1.abcdefgh.payload.sig";
const SIG = "s".repeat(86);

type Event = { data: unknown; origin: string; source: unknown };

function world({ verify = "ok", lna = "prompt", oldNode = false, mint = { kind: "ok", token: TOKEN } } = {} as Record<string, unknown>) {
  const frame = { posted: [] as Array<{ message: unknown; origin: string }>, postMessage(message: unknown, origin: string) { frame.posted.push({ message, origin }); } };
  const phases: TerminalFramePhase[] = [];
  let handler: (event: Event) => void = () => {};
  let fireDeadline: () => void = () => {};
  let nonces = 0;
  const controller = createTerminalFrame({
    frame: () => frame,
    listen: (next) => { handler = next; return () => {}; },
    lookup: async (id) => (id === MACHINE ? LAPTOP : "other-account"),
    mint: async () => mint as never,
    verify: async () => verify as never,
    nonce: () => `nonce-${++nonces}-${"x".repeat(20)}`,
    schedule: (fire) => { fireDeadline = fire; return () => { fireDeadline = () => {}; }; },
    colors: () => ({ background: "#101010" }),
    localNetwork: async () => lna as never,
    probeOldNode: async () => oldNode as boolean,
    onPhase: (phase) => phases.push(phase),
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const deliver = (data: unknown, origin = NODE, source: unknown = frame) => handler({ data, origin, source });
  return { frame, phases, controller, settle, deliver, timeout: () => fireDeadline() };
}

async function handshake(w: ReturnType<typeof world>) {
  w.deliver({ type: "osionos-ide/ready", node: MACHINE });
  await w.settle();
  const hello = w.frame.posted.find((p) => (p.message as { type: string }).type === "osionos-ide/hello")!.message as { nonce: string };
  w.deliver({ type: "osionos-ide/identity", machineId: MACHINE, sig: SIG });
  await w.settle();
  return hello;
}

test("the frame is the node's terminal page, on the node's own origin", () => {
  assert.equal(TERMINAL_PAGE_URL, `${NODE}/terminal/index.html`);
});

test("W11: ready, a verified identity, then one token posted to the exact node origin; colours once", async () => {
  const w = world();
  assert.deepEqual(w.phases, ["connecting"]);
  await handshake(w);
  const types = w.frame.posted.map((p) => (p.message as { type: string }).type);
  assert.deepEqual(types, ["osionos-terminal/colors", "osionos-ide/hello", "osionos-ide/session"]);
  assert.ok(w.frame.posted.every((p) => p.origin === NODE));
  assert.deepEqual(w.frame.posted[2].message, { type: "osionos-ide/session", token: TOKEN });
  w.deliver({ type: "osionos-ide/state", state: "connected" });
  assert.equal(w.phases.at(-1), "connected");
});

test("W11: another window, another origin, or the node's origin on another port is ignored", async () => {
  const w = world();
  w.deliver({ type: "osionos-ide/ready", node: MACHINE }, NODE, {});
  w.deliver({ type: "osionos-ide/ready", node: MACHINE }, "https://evil.example");
  w.deliver({ type: "osionos-ide/ready", node: MACHINE }, "http://127.0.0.1:4101");
  w.deliver({ type: "osionos-ide/ready", node: MACHINE }, "http://localhost:4100");
  await w.settle();
  assert.deepEqual(w.frame.posted, []);
});

test("W11: a failed identity posts no token, and says why", async () => {
  for (const verify of ["mismatch", "unavailable"]) {
    const w = world({ verify });
    await handshake(w);
    assert.ok(!w.frame.posted.some((p) => (p.message as { type: string }).type === "osionos-ide/session"), verify);
    assert.equal(w.phases.at(-1), verify);
  }
  const stranger = world();
  stranger.deliver({ type: "osionos-ide/ready", node: "m-ponmlkjihgfedcba" });
  await stranger.settle();
  assert.equal(stranger.phases.at(-1), "other-account");
});

test("a need-session after the first shell runs a fresh identity check before the next token", async () => {
  const w = world();
  const first = await handshake(w);
  w.frame.posted.length = 0;
  w.deliver({ type: "osionos-ide/need-session" });
  await w.settle();
  const second = w.frame.posted[0].message as { type: string; nonce: string };
  assert.equal(second.type, "osionos-ide/hello");
  assert.notEqual(second.nonce, first.nonce);
});

test("a step-up stays in the dock as its own phase", async () => {
  const w = world({ mint: { kind: "step-up" } });
  await handshake(w);
  assert.equal(w.phases.at(-1), "step-up");
});

test("W14: no answer within the bound is 'not running'; a blocked local network or an old node say so", async () => {
  const cases: Array<[Record<string, unknown>, TerminalFramePhase]> = [
    [{}, "no-node"], [{ lna: "denied" }, "lna-blocked"], [{ oldNode: true }, "old-node"], [{ lna: "unknown" }, "no-node"],
  ];
  for (const [options, phase] of cases) {
    const w = world(options);
    w.timeout();
    await w.settle();
    assert.equal(w.phases.at(-1), phase, JSON.stringify(options));
  }
});

test("W14: a frame that answers after the bound (a slow local-network prompt) still connects", async () => {
  const w = world();
  w.timeout();
  await w.settle();
  assert.equal(w.phases.at(-1), "no-node");
  await handshake(w);
  w.deliver({ type: "osionos-ide/state", state: "connected" });
  assert.equal(w.phases.at(-1), "connected");
});

test("W14: every panel is plain words and buttons: no command, no path, no flag", () => {
  const phases: TerminalFramePhase[] = ["connecting", "step-up", "no-node", "lna-blocked", "old-node", "other-account", "mismatch", "unavailable", "error"];
  for (const phase of phases) {
    const panel = terminalFramePanel(phase, "");
    assert.ok(panel, phase);
    assert.doesNotMatch(`${panel.title} ${panel.detail ?? ""}`, /osionos-node|~\/|\.osionos|pnpm|--|`|\bnode\b|serve|cli\.mjs/, phase);
  }
  assert.equal(terminalFramePanel("connected", ""), null, "a connected frame shows nothing over it");
  assert.equal(terminalFramePanel("no-node", "").title, "osionos Connector isn't running on this computer.");
  assert.equal(terminalFramePanel("old-node", "").title, "osionos Connector needs an update.");
  assert.match(terminalFramePanel("no-node", "").detail ?? "", /allow/i, "W14: it names the blocked local network too");
  assert.match(terminalFramePanel("lna-blocked", "").detail ?? "", /site settings/);
});

// Owner 2026-11-01: the dock said "Confirm it's you" and offered nothing to click.
test("the step-up panel says what happens and offers the button that opens the code prompt", () => {
  const panel = terminalFramePanel("step-up", "");
  assert.ok(panel);
  assert.equal(panel.confirm, true);
  assert.match(panel.detail ?? "", /email/i, "it says a code comes by email");
  const others: TerminalFramePhase[] = ["connecting", "no-node", "lna-blocked", "old-node", "other-account", "mismatch", "unavailable", "error"];
  for (const phase of others) assert.equal(terminalFramePanel(phase, "")?.confirm, false, phase);
});

test("the download button appears only when its address is set; try again is always there on a failure", () => {
  assert.equal(terminalFramePanel("no-node", "").download, null);
  assert.equal(terminalFramePanel("no-node", "https://example.test/connector").download, "https://example.test/connector");
  assert.equal(terminalFramePanel("old-node", "https://example.test/connector").download, "https://example.test/connector");
  assert.equal(terminalFramePanel("lna-blocked", "https://example.test/connector").download, null);
  for (const phase of ["no-node", "lna-blocked", "old-node", "mismatch", "unavailable", "error"] as const) assert.ok(terminalFramePanel(phase, "").tryAgain, phase);
  assert.equal(terminalFramePanel("connecting", "").tryAgain, false);
  assert.equal(terminalFramePanel("other-account", "").pair, true);
});
