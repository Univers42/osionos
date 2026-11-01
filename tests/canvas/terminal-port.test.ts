// The terminal page reaches the desktop's shell only through ports the panel routes to the iframe
// it rendered itself (devil amendments A1 and 2, T1; groot ADR 0039). The preload posts each pty's
// port to the app's window; any embed can post one shaped the same way, so the panel forwards a
// port only from its own window, for an id its own create returned, once. Every other port is closed.
import test from "node:test";
import assert from "node:assert/strict";

import {
  APP_ORIGIN,
  PTY_PORT_MESSAGE,
  TERMINAL_ORIGIN,
  TERMINAL_PORT_MESSAGE,
  acceptTerminalPort,
  ptyApiOverPort,
  terminalColorsFrom,
} from "../../src/features/ide/model/terminalPort.ts";
import { handOffTerminalPort, refusePtyPort, servePtyToFrame } from "../../src/features/ide/model/ptyPortRouter.ts";
import { fakePort, fakePty, fakePtyHost } from "./support/local-pty-fakes.ts";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
async function until(arrived: () => boolean) {
  for (let waited = 0; !arrived() && waited < 2000; waited += 5) await tick();
}

const SELF = { name: "the app's window" };

function panel(created: Array<string | null | Error> = ["p1", "p2"], portWaitMs?: number) {
  const desktop = fakePty(created);
  const control = fakePort("control");
  const router = servePtyToFrame(control, desktop.api, SELF, portWaitMs);
  const ask = (req: number, cols = 80, rows = 24) => control.receive({ op: "create", req, cols, rows });
  const offer = (id: unknown, override: Record<string, unknown> = {}) => {
    const port = fakePort(String(id));
    router.offer({ source: SELF, origin: APP_ORIGIN, data: { type: PTY_PORT_MESSAGE, id }, ports: [port], ...override });
    return port;
  };
  const replies = () => control.posted.map((posted) => posted.message);
  const forwarded = () => control.posted.flatMap((posted) => posted.transfer);
  return { desktop, control, router, ask, offer, replies, forwarded };
}

test("a port that arrives after create returned is forwarded in the created reply", async () => {
  const p = panel();
  p.ask(1, 100, 30);
  await settle();
  assert.deepEqual(p.desktop.calls, [["create", 100, 30]]);
  assert.deepEqual(p.replies(), []);
  const port = p.offer("p1");
  assert.deepEqual(p.replies(), [{ op: "created", req: 1, id: "p1" }]);
  assert.deepEqual(p.forwarded(), [port]);
  assert.equal(port.closed, false);
  p.router.stop();
});

test("a port that arrives before create returned waits for it, then is forwarded", async () => {
  const p = panel();
  const answer = p.desktop.deferCreate();
  p.ask(1);
  await settle();
  const port = p.offer("p1");
  assert.equal(port.closed, false);
  assert.deepEqual(p.replies(), []);
  answer("p1");
  await settle();
  assert.deepEqual(p.replies(), [{ op: "created", req: 1, id: "p1" }]);
  assert.deepEqual(p.forwarded(), [port]);
  p.router.stop();
});

test("a port posted from another window, with a valid-looking id, is closed and not forwarded", async () => {
  const p = panel();
  p.ask(1);
  await settle();
  const spoofed = p.offer("p1", { source: { name: "an embed" } });
  const wrongOrigin = p.offer("p1", { origin: "https://evil.example" });
  assert.equal(spoofed.closed, true);
  assert.equal(wrongOrigin.closed, true);
  assert.deepEqual(p.replies(), []);
  const real = p.offer("p1");
  assert.deepEqual(p.forwarded(), [real]);
  p.router.stop();
});

test("a port for an id this panel did not create is closed", async () => {
  const p = panel();
  p.ask(1);
  await settle();
  const unknown = p.offer("p9");
  const malformed = p.offer(42);
  assert.equal(unknown.closed, true);
  assert.equal(malformed.closed, true);
  assert.deepEqual(p.replies(), []);
  p.router.stop();
});

test("an early port is closed once every create came back with another id", async () => {
  const p = panel();
  const answer = p.desktop.deferCreate();
  p.ask(1);
  await settle();
  const stray = p.offer("p9");
  assert.equal(stray.closed, false);
  answer("p1");
  await settle();
  assert.equal(stray.closed, true);
  p.router.stop();
});

test("a second port for one id is closed, before or after the first was routed", async () => {
  const p = panel();
  const answer = p.desktop.deferCreate();
  p.ask(1);
  await settle();
  const first = p.offer("p1");
  const heldTwice = p.offer("p1");
  answer("p1");
  await settle();
  const routedTwice = p.offer("p1");
  assert.deepEqual([first.closed, heldTwice.closed, routedTwice.closed], [false, true, true]);
  assert.deepEqual(p.forwarded(), [first]);
  p.router.stop();
});

test("a message with two ports, or after stop, closes every port in it", async () => {
  const p = panel();
  p.ask(1);
  await settle();
  const pair = [fakePort("a"), fakePort("b")];
  p.offer("p1", { ports: pair });
  assert.deepEqual(pair.map((port) => port.closed), [true, true]);
  p.router.stop();
  const late = p.offer("p1");
  assert.equal(late.closed, true);
  assert.deepEqual(p.forwarded(), []);
});

test("messages that are not the preload's keep their ports", () => {
  const p = panel();
  const theirs = fakePort("theirs");
  p.router.offer({ source: { name: "an embed" }, origin: "https://x.example", data: { type: "other" }, ports: [theirs] });
  refusePtyPort({ source: SELF, origin: APP_ORIGIN, data: "text", ports: [theirs] });
  assert.equal(theirs.closed, false);
  const ours = fakePort("ours");
  refusePtyPort({ source: SELF, origin: APP_ORIGIN, data: { type: PTY_PORT_MESSAGE, id: "p1" }, ports: [ours] });
  assert.equal(ours.closed, true);
  p.router.stop();
});

test("a refused create answers null, a failed one answers failed", async () => {
  const p = panel([null, new Error("pty host gone")]);
  p.ask(1);
  p.ask(2);
  await settle();
  assert.deepEqual(p.replies(), [{ op: "created", req: 1, id: null }, { op: "created", req: 2, id: null, failed: true }]);
  p.router.stop();
});

test("a port that never arrives ends in a failed reply and a killed shell", async () => {
  const p = panel(["p1"], 10);
  p.ask(1);
  await until(() => p.replies().length > 0);
  assert.deepEqual(p.replies(), [{ op: "created", req: 1, id: null, failed: true }]);
  assert.deepEqual(p.desktop.calls.at(-1), ["kill", "p1"]);
  assert.equal(p.offer("p1").closed, true);
  assert.equal(p.desktop.listeners(), 0);
  p.router.stop();
});

test("a shell that exits before its port arrived answers failed, and its port is closed", async () => {
  const p = panel();
  p.ask(1);
  await settle();
  p.desktop.exit("p1", 1);
  assert.deepEqual(p.replies(), [{ op: "created", req: 1, id: null, failed: true }]);
  assert.equal(p.offer("p1").closed, true);
  p.router.stop();
});

test("the frame kills only shells this panel created", async () => {
  const p = panel();
  p.ask(1);
  await settle();
  p.offer("p1");
  p.control.receive({ op: "kill", id: "p999" });
  p.control.receive({ op: "write", id: "p1", data: "x" });
  p.control.receive({ op: "kill", id: "p1" });
  p.control.receive({ op: "kill", id: "p1" });
  assert.deepEqual(p.desktop.calls, [["create", 80, 24], ["kill", "p1"]]);
  assert.equal(p.desktop.listeners(), 0);
  p.router.stop();
});

test("malformed requests never reach the desktop", async () => {
  const p = panel();
  p.control.receive({ op: "create", req: 1, cols: "80", rows: 24 });
  p.control.receive({ op: "create", req: 2, cols: 0, rows: 24 });
  p.control.receive({ op: "create", req: 1.5, cols: 80, rows: 24 });
  p.control.receive(null);
  await settle();
  assert.deepEqual(p.desktop.calls, []);
  p.router.stop();
});

test("stopping kills every shell this panel created and closes its ports", async () => {
  const p = panel(["p1", "p2", "p3"]);
  const answer = p.desktop.deferCreate();
  p.ask(1);
  await settle();
  const early = p.offer("p3");
  // p1 was deferred; the next two are answered at once.
  p.desktop.api.create = async () => "p2";
  p.ask(2);
  await settle();
  p.router.stop();
  answer("p1");
  await settle();
  assert.deepEqual(p.desktop.of("kill").map((c) => c[1]), ["p2", "p1"]);
  assert.equal(early.closed, true);
  assert.equal(p.control.closed, true);
  assert.equal(p.desktop.listeners(), 0);
});

test("the panel hands its frame one control port, to app://terminal only", () => {
  const desktop = fakePty();
  const posted: Array<{ message: unknown; origin: string; ports: MessagePort[] }> = [];
  const frame = { postMessage: (message: unknown, origin: string, ports: MessagePort[]) => posted.push({ message, origin, ports }) };
  const router = handOffTerminalPort(frame, desktop.api, { background: "#0d1117" }, SELF);
  assert.equal(TERMINAL_ORIGIN, "app://terminal");
  assert.equal(posted.length, 1);
  assert.equal(posted[0].origin, "app://terminal");
  assert.deepEqual(posted[0].message, { type: TERMINAL_PORT_MESSAGE, colors: { background: "#0d1117" } });
  assert.equal(posted[0].ports.length, 1);
  router.stop();
  posted[0].ports[0].close();
});

test("the page takes the handoff only from its parent, the app's top page, on app://osionos", () => {
  const top = { name: "top" };
  const self = { name: "frame" };
  const { port1, port2 } = new MessageChannel();
  const page = { parent: top, top, self };
  const good = { source: top, origin: APP_ORIGIN, data: { type: TERMINAL_PORT_MESSAGE }, ports: [port1] };
  assert.equal(acceptTerminalPort(good, page), port1);
  assert.equal(acceptTerminalPort({ ...good, source: {} }, page), null);
  assert.equal(acceptTerminalPort({ ...good, origin: "app://terminal" }, page), null);
  assert.equal(acceptTerminalPort({ ...good, origin: "https://evil.example" }, page), null);
  assert.equal(acceptTerminalPort({ ...good, data: { type: "other" } }, page), null);
  assert.equal(acceptTerminalPort({ ...good, data: null }, page), null);
  assert.equal(acceptTerminalPort({ ...good, ports: [] }, page), null);
  // Nested one level deeper (A2), or opened on its own: no handoff.
  const nestedParent = { name: "an embed" };
  assert.equal(acceptTerminalPort({ ...good, source: nestedParent }, { parent: nestedParent, top, self }), null);
  assert.equal(acceptTerminalPort({ ...good, source: self }, { parent: self, top: self, self }), null);
  port1.close(); port2.close();
});

test("the page's create resolves with the shell's own port, and kill goes over control", async () => {
  const control = fakePort("control");
  const page = ptyApiOverPort(control);
  const created = page.create(80, 24);
  const refused = page.create(80, 24);
  const failed = page.create(80, 24);
  assert.deepEqual(control.posted.map((p) => p.message), [1, 2, 3].map((req) => ({ op: "create", req, cols: 80, rows: 24 })));
  const ptyPort = fakePort("p1");
  control.receive({ op: "created", req: 1, id: "p1" }, [ptyPort]);
  control.receive({ op: "created", req: 2, id: null });
  control.receive({ op: "created", req: 3, id: null, failed: true });
  assert.deepEqual(await created, { id: "p1", port: ptyPort });
  assert.equal(await refused, null);
  await assert.rejects(failed, /could not start/);
  page.kill("p1");
  assert.deepEqual(control.posted.at(-1)?.message, { op: "kill", id: "p1" });
});

test("a created reply without its port, or for nobody, kills that shell on the page side", () => {
  const control = fakePort("control");
  const page = ptyApiOverPort(control);
  void page.create(80, 24);
  control.receive({ op: "created", req: 1, id: "p1" });
  const orphan = fakePort("p2");
  control.receive({ op: "created", req: 99, id: "p2" }, [orphan]);
  assert.deepEqual(control.posted.slice(1).map((p) => p.message), [{ op: "kill", id: "p1" }, { op: "kill", id: "p2" }]);
  assert.equal(orphan.closed, true);
});

test("over real ports: the frame types to the pty host directly, and output and exit come back", async () => {
  const desktop = fakePty(["p1"]);
  const host = fakePtyHost(desktop.calls);
  let control: MessagePort | undefined;
  const router = handOffTerminalPort({ postMessage: (_m, _o, ports) => { control = ports[0] as MessagePort; } }, desktop.api, {}, SELF);
  const create = desktop.api.create;
  // The preload: main answers create, then the pty's port reaches the window in its own task.
  desktop.api.create = async (cols, rows) => {
    const id = await create(cols, rows);
    if (id) setTimeout(() => router.offer({ source: SELF, origin: APP_ORIGIN, data: { type: PTY_PORT_MESSAGE, id }, ports: [host.open(id)] }), 0);
    return id;
  };
  const page = ptyApiOverPort(control as MessagePort);
  const shell = await page.create(80, 24);
  assert.ok(shell);
  const out: unknown[] = [];
  shell.port.onmessage = (event) => out.push(event.data);
  shell.port.postMessage({ op: "write", data: "ls\r" });
  shell.port.postMessage({ op: "resize", cols: 100, rows: 40 });
  await until(() => desktop.calls.length === 3);
  assert.deepEqual(desktop.calls, [["create", 80, 24], ["write", "p1", "ls\r"], ["resize", "p1", 100, 40]]);
  host.output("p1", "hello");
  host.exit("p1", 0);
  await until(() => out.length === 2);
  assert.deepEqual(out, [{ op: "data", data: "hello" }, { op: "exit", exitCode: 0 }]);
  router.stop();
  shell.port.close();
  (control as MessagePort).close();
  host.closeAll();
});

test("only hex colours cross into the terminal's theme", () => {
  assert.deepEqual(
    terminalColorsFrom({ background: "#0d1117", foreground: "#E6EDF3", cursor: "url(x)", selection: "rgba(56, 139, 253, 0.35)", extra: "#fff" }),
    { background: "#0d1117", foreground: "#E6EDF3" },
  );
  assert.deepEqual(terminalColorsFrom(null), {});
  assert.deepEqual(terminalColorsFrom({ background: 12 }), {});
});
