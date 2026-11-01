// The terminal page reaches the desktop's shell only through a port the panel handed to the iframe
// it rendered itself (devil amendment A1, 2026-10-31): framing the page grants nothing, a page asks
// only for its own ptys, and closing the port ends them.
import test from "node:test";
import assert from "node:assert/strict";

import {
  TERMINAL_PORT_MESSAGE,
  acceptTerminalPort,
  handOffTerminalPort,
  ptyApiOverPort,
  servePtyOverPort,
  terminalColorsFrom,
} from "../../src/features/ide/model/terminalPort.ts";
import { fakePty } from "./support/local-pty-fakes.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

// An open MessagePort keeps node alive: a failed assertion must not leave one behind.
const openChannels: MessageChannel[] = [];
test.afterEach(() => {
  for (const channel of openChannels.splice(0)) { channel.port1.close(); channel.port2.close(); }
});
function channelOpen(): MessageChannel {
  const opened = new MessageChannel();
  openChannels.push(opened);
  return opened;
}

function linked(created: Array<string | null | Error> = ["p1", "p2"]) {
  const desktop = fakePty(created);
  const channel = channelOpen();
  const stop = servePtyOverPort(channel.port1, desktop.api);
  const page = ptyApiOverPort(channel.port2);
  return { desktop, page, stop, channel };
}

test("the page creates a shell, types, resizes and acknowledges through the port", async () => {
  const w = linked();
  const id = await w.page.create(100, 30);
  assert.equal(id, "p1");
  w.page.write("p1", "ls\r");
  w.page.resize("p1", 120, 40);
  w.page.ack("p1", 2048);
  await tick();
  assert.deepEqual(w.desktop.calls, [["create", 100, 30], ["write", "p1", "ls\r"], ["resize", "p1", 120, 40], ["ack", "p1", 2048]]);
  w.stop(); w.channel.port2.close();
});

test("output and exit come back to the page's listeners", async () => {
  const w = linked();
  const out: string[] = [];
  const exits: number[] = [];
  await w.page.create(80, 24);
  w.page.onData("p1", (d) => out.push(d));
  w.page.onExit("p1", (c) => exits.push(c));
  await tick();
  w.desktop.emit("p1", "hello");
  w.desktop.exit("p1", 0);
  await tick();
  assert.deepEqual(out, ["hello"]);
  assert.deepEqual(exits, [0]);
  w.stop(); w.channel.port2.close();
});

test("a page reaches only the ptys it created over this port", async () => {
  const w = linked();
  await w.page.create(80, 24);
  w.page.write("p999", "rm -rf ~\r");
  w.page.kill("p999");
  w.channel.port2.postMessage({ op: "write", id: "p999", data: "x" });
  w.channel.port2.postMessage({ op: "bogus" });
  await tick();
  assert.deepEqual(w.desktop.calls.map((c) => c[0]), ["create"]);
  w.stop(); w.channel.port2.close();
});

test("stopping the panel's side kills the shells it served", async () => {
  const w = linked();
  await w.page.create(80, 24);
  await w.page.create(80, 24);
  w.stop();
  assert.deepEqual(w.desktop.calls.filter((c) => c[0] === "kill").map((c) => c[1]), ["p1", "p2"]);
  w.channel.port2.close();
});

test("malformed requests never reach the desktop", async () => {
  const w = linked();
  w.channel.port2.postMessage({ op: "create", req: 1, cols: "80", rows: 24 });
  w.channel.port2.postMessage({ op: "create", req: 2, cols: 0, rows: 24 });
  w.channel.port2.postMessage(null);
  await tick();
  assert.deepEqual(w.desktop.calls, []);
  w.stop(); w.channel.port2.close();
});

test("the panel hands its own frame one port, to the app's origin only", async () => {
  const desktop = fakePty(["p1", "p2"]);
  const posted: Array<{ message: unknown; origin: string; ports: MessagePort[] }> = [];
  const frame = { postMessage: (message: unknown, origin: string, ports: MessagePort[]) => posted.push({ message, origin, ports }) };
  const stop = handOffTerminalPort(frame, desktop.api, "app://osionos", { background: "#0d1117" });
  assert.equal(posted.length, 1);
  assert.equal(posted[0].origin, "app://osionos");
  assert.deepEqual(posted[0].message, { type: TERMINAL_PORT_MESSAGE, colors: { background: "#0d1117" } });
  const page = ptyApiOverPort(posted[0].ports[0]);
  assert.equal(await page.create(80, 24), "p1");
  stop();
  assert.deepEqual(desktop.calls.map((c) => c[0]), ["create", "kill"]);
  posted[0].ports[0].close();
});

test("the page takes a port only from its parent, on its own origin, in the panel's message", () => {
  const parent = {};
  const { port1 } = channelOpen();
  const good = { source: parent, origin: "app://osionos", data: { type: TERMINAL_PORT_MESSAGE }, ports: [port1] };
  const page = { parent, origin: "app://osionos" };
  assert.equal(acceptTerminalPort(good, page), port1);
  assert.equal(acceptTerminalPort({ ...good, source: {} }, page), null);
  assert.equal(acceptTerminalPort({ ...good, origin: "https://evil.example" }, page), null);
  assert.equal(acceptTerminalPort({ ...good, data: { type: "other" } }, page), null);
  assert.equal(acceptTerminalPort({ ...good, data: null }, page), null);
  assert.equal(acceptTerminalPort({ ...good, ports: [] }, page), null);
});

test("only hex colours cross into the terminal's theme", () => {
  assert.deepEqual(
    terminalColorsFrom({ background: "#0d1117", foreground: "#E6EDF3", cursor: "url(x)", selection: "rgba(56, 139, 253, 0.35)", extra: "#fff" }),
    { background: "#0d1117", foreground: "#E6EDF3" },
  );
  assert.deepEqual(terminalColorsFrom(null), {});
  assert.deepEqual(terminalColorsFrom({ background: 12 }), {});
});

test("a shell the desktop creates after the panel stopped is killed, not served", async () => {
  const desktop = fakePty(["p1", "p2"]);
  const finish = desktop.deferCreate();
  const channel = channelOpen();
  const stop = servePtyOverPort(channel.port1, desktop.api);
  channel.port2.postMessage({ op: "create", req: 1, cols: 80, rows: 24 });
  await tick();
  stop();
  finish("p9");
  await tick();
  assert.deepEqual(desktop.calls, [["kill", "p9"]]);
  assert.equal(desktop.listeners(), 0);
  channel.port2.close();
});

test("a create the desktop fails rejects on the page, without an unhandled rejection", async () => {
  const w = linked([new Error("pty host gone")]);
  await assert.rejects(w.page.create(80, 24), /could not start/);
  w.stop(); w.channel.port2.close();
});
