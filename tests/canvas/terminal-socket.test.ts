// The web terminal page's transport (devil verdict 2026-11-01, W3, W5, U6; groot ADR 0041): the
// desktop's TerminalPtyApi over one WebSocket per shell to this computer's node. The socket's first
// message is the frame's session secret when it holds one, else one fresh token from the app.
import assert from "node:assert/strict";
import test from "node:test";

import { ptyApiOverWebSocket, type SocketLike } from "../../src/features/ide/model/terminalSocket.ts";
import { createFrameCredentials } from "../../src/features/ide/model/terminalCredentials.ts";
import { createLocalPtyProcess } from "../../src/features/ide/model/localPtyProcess.ts";

const TOKEN_A = "osionos_mc1.abcdefgh.payloadA.sigA";
const TOKEN_B = "osionos_mc1.abcdefgh.payloadB.sigB";
const SECRET = "S".repeat(43);

function fakeSocket(): SocketLike & { sent: unknown[]; closed: boolean; open(): void; push(message: unknown): void; end(code: number): void } {
  const socket = {
    sent: [] as unknown[], closed: false,
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onclose: null as ((event: { code: number }) => void) | null,
    send(text: string) { socket.sent.push(JSON.parse(text)); },
    close() { socket.closed = true; },
    open() { socket.onopen?.(); },
    push(message: unknown) { socket.onmessage?.({ data: JSON.stringify(message) }); },
    end(code: number) { socket.onclose?.({ code }); },
  };
  return socket;
}

function world() {
  const sockets: ReturnType<typeof fakeSocket>[] = [];
  let asks = 0;
  const credentials = createFrameCredentials({ ask: () => { asks++; } });
  const api = ptyApiOverWebSocket(() => { const s = fakeSocket(); sockets.push(s); return s; }, credentials);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { sockets, credentials, api, settle, asks: () => asks };
}

test("the first shell waits for a token, sends it once with its size, and keeps the frame's secret", async () => {
  const w = world();
  const created = w.api.create(80, 24);
  await w.settle();
  assert.equal(w.asks(), 1, "it asked the app for a token");
  assert.equal(w.sockets.length, 0, "no socket before a credential");
  w.credentials.give(TOKEN_A);
  await w.settle();
  w.sockets[0].open();
  assert.deepEqual(w.sockets[0].sent, [{ token: TOKEN_A, cols: 80, rows: 24 }]);
  w.sockets[0].push({ op: "opened", secret: SECRET });
  const shell = await created;
  assert.ok(shell && shell.id.length > 0);
  const second = w.api.create(100, 30);
  await w.settle();
  w.sockets[1].open();
  assert.deepEqual(w.sockets[1].sent, [{ secret: SECRET, cols: 100, rows: 30 }], "later shells use the secret, not a token");
  assert.equal(w.asks(), 1);
  w.sockets[1].push({ op: "opened" });
  assert.ok(await second);
});

test("a refused secret is dropped and the shell retries once with a fresh token", async () => {
  const w = world();
  w.credentials.keepSecret(SECRET);
  const created = w.api.create(80, 24);
  await w.settle();
  w.sockets[0].open();
  w.sockets[0].end(4401);
  await w.settle();
  assert.equal(w.asks(), 1);
  w.credentials.give(TOKEN_B);
  await w.settle();
  w.sockets[1].open();
  assert.deepEqual(w.sockets[1].sent, [{ token: TOKEN_B, cols: 80, rows: 24 }]);
  w.sockets[1].end(4401);
  await assert.rejects(created, /refused/, "a second refusal ends it: no loop");
});

test("eight open gives null (VS Code says so); another close before opening rejects", async () => {
  const w = world();
  w.credentials.keepSecret(SECRET);
  const full = w.api.create(80, 24);
  await w.settle();
  w.sockets[0].end(4429);
  assert.equal(await full, null);
  const gone = w.api.create(80, 24);
  await w.settle();
  w.sockets[1].end(1006);
  await assert.rejects(gone, /could not reach/);
});

test("only one token is asked for at a time; a second waiter asks after the first is served", async () => {
  const w = world();
  const one = w.api.create(80, 24);
  const two = w.api.create(80, 24);
  await w.settle();
  assert.equal(w.asks(), 1, "the app's handshake holds one nonce at a time");
  w.credentials.give(TOKEN_A);
  await w.settle();
  assert.equal(w.asks(), 2);
  w.credentials.give(TOKEN_B);
  await w.settle();
  assert.deepEqual(w.sockets.map((s) => { s.open(); return (s.sent[0] as { token: string }).token; }), [TOKEN_A, TOKEN_B]);
  w.sockets.forEach((s) => s.push({ op: "opened" }));
  assert.ok((await one) && (await two));
});

test("the shared pty process runs on the socket: input, output without OSC 52 reads, exit, kill", async () => {
  const w = world();
  w.credentials.keepSecret(SECRET);
  const output: string[] = [];
  const exits: number[] = [];
  const pty = createLocalPtyProcess(w.api, { data: (d) => output.push(d), exit: (c) => exits.push(c) });
  const started = pty.start(80, 24);
  await w.settle();
  const [socket] = w.sockets;
  socket.open();
  socket.push({ op: "opened" });
  assert.equal(await started, "started");
  pty.input("ls\r");
  pty.resize(120, 40);
  pty.ack(5000);
  assert.deepEqual(socket.sent.slice(1), [{ op: "write", data: "ls\r" }, { op: "resize", cols: 120, rows: 40 }, { op: "ack", chars: 5000 }]);
  socket.push({ op: "data", data: "a\u001b]52;c;?\u0007b" });
  assert.deepEqual(output, ["a\u0018b"], "W13: the clipboard read is dropped (CAN stands in, osc52ReadFilter.ts)");
  socket.push({ op: "exit", exitCode: 0 });
  assert.deepEqual(exits, [0]);
  assert.equal(socket.closed, true);
});

test("a socket that drops after opening ends the terminal; kill closes it", async () => {
  const w = world();
  w.credentials.keepSecret(SECRET);
  const exits: number[] = [];
  const pty = createLocalPtyProcess(w.api, { data() {}, exit: (c) => exits.push(c) });
  const started = pty.start(80, 24);
  await w.settle();
  w.sockets[0].open();
  w.sockets[0].push({ op: "opened" });
  await started;
  w.sockets[0].end(1006);
  assert.equal(exits.length, 1, "VS Code shows the terminal ended");
  const shell = w.api.create(80, 24);
  await w.settle();
  w.sockets[1].open();
  w.sockets[1].push({ op: "opened" });
  const opened = await shell;
  w.api.kill(opened!.id);
  assert.equal(w.sockets[1].closed, true);
});
