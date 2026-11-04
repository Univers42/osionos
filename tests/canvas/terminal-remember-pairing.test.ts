// Old and new on each side (devil verdict 2026-11-01, Amendment 1, R14), and the whole remember loop,
// with the frame's real transport talking to the node's real /api/pty service: an old frame (frozen at
// develop 37eef965) against a node that remembers, and a new frame against the node released before
// remembering (its wire frozen at bae4497e). Both stay on the token path.
import assert from "node:assert/strict";
import test from "node:test";

import { ptyApiOverWebSocket, type SocketLike } from "../../src/features/ide/model/terminalSocket.ts";
import { createFrameCredentials, rememberedStoreOver } from "../../src/features/ide/model/terminalCredentials.ts";
import { createTokenCredentials as oldCredentials, ptyApiOverWebSocket as oldPtyApi } from "../fixtures/terminal-frame-37eef965/terminalSocket.ts";
// @ts-expect-error -- a frozen .mjs fixture with no types
import { readPtyAuth as oldReadPtyAuth } from "../fixtures/osionos-node-bae4497e/pty-wire.mjs";
// @ts-expect-error -- the node test world is .mjs with no types
import { mint, mintResume, world } from "../bridge/support/pty-world.mjs";
// @ts-expect-error -- the node test fakes are .mjs with no types
import { FakeConn } from "../bridge/support/pty-fakes.mjs";

const PROD = "https://baas.tail10f2ea.ts.net:8443";
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

type Node = { origin: { pty: { attach(conn: unknown): void } }; base: string; host: { spawned: number } };

/** A browser WebSocket to the node's pty service: the frame's side of a FakeConn the node holds. */
function socketTo(node: Node, firstMessages: unknown[]): SocketLike {
  const conn = new FakeConn();
  let opening = true;
  const socket: SocketLike = {
    onopen: null, onmessage: null, onclose: null,
    send: (text) => {
      if (opening) firstMessages.push(JSON.parse(text));
      opening = false;
      conn.receive(text);
    },
    close: () => conn.close(1000),
  };
  const send = conn.send.bind(conn);
  conn.send = (text: string) => { send(text); socket.onmessage?.({ data: text }); };
  conn.on("close", (code: number) => socket.onclose?.({ code }));
  node.origin.pty.attach(conn);
  queueMicrotask(() => socket.onopen?.());
  return socket;
}

function memoryStorage() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, removeItem: (key: string) => { items.delete(key); } } as unknown as Storage;
}

test("R14: an old frame against a node that remembers opens on the token path, then on its session secret", async (t) => {
  const node: Node = await world(t, { remember: [PROD] });
  const first: unknown[] = [];
  const credentials = oldCredentials(() => {});
  credentials.give(mint(node.base, { remember: true }));
  const api = oldPtyApi(() => socketTo(node, first), credentials);
  assert.ok(await api.create(80, 24));
  assert.ok(await api.create(80, 24), "the second shell rides the session secret");
  assert.deepEqual(first.map((message) => Object.keys(message as object).sort()), [["cols", "rows", "token"], ["cols", "rows", "secret"]]);
  assert.equal(node.host.spawned, 2);
});

test("R14: a new frame against a node that does not remember sends only openings that node reads", async (t) => {
  const node: Node = await world(t);
  const first: unknown[] = [];
  const credentials = createFrameCredentials({ ask: () => {}, appOrigin: () => PROD, remembers: false, store: rememberedStoreOver(memoryStorage) });
  credentials.give(mint(node.base, { remember: true }));
  const api = ptyApiOverWebSocket(() => socketTo(node, first), credentials);
  assert.ok(await api.create(80, 24));
  assert.ok(await api.create(80, 24));
  assert.equal(first.length, 2);
  for (const opening of first) assert.notEqual(oldReadPtyAuth(JSON.stringify(opening)), null, JSON.stringify(Object.keys(opening as object)));
});

test("R1, R6: the whole loop on the real service: one step-up remembers, the next load opens with no token", async (t) => {
  const node: Node = await world(t, { remember: [PROD] });
  const storage = memoryStorage();
  const sent: unknown[] = [];
  const stepUp = createFrameCredentials({ ask: () => {}, appOrigin: () => PROD, remembers: true, store: rememberedStoreOver(() => storage) });
  stepUp.give(mint(node.base, { remember: true }));
  assert.ok(await ptyApiOverWebSocket(() => socketTo(node, sent), stepUp).create(80, 24));
  assert.match(storage.getItem(`osionos-remembered:${PROD}`) ?? "", /^[A-Za-z0-9_-]{43}$/);

  const asks: string[] = [];
  const reload = createFrameCredentials({ ask: (kind) => asks.push(kind), appOrigin: () => PROD, remembers: true, store: rememberedStoreOver(() => storage) });
  reload.giveResume(mintResume(node.base));
  assert.ok(await ptyApiOverWebSocket(() => socketTo(node, sent), reload).create(80, 24));
  await settle();
  assert.deepEqual(Object.keys(sent[1] as object).sort(), ["appOrigin", "assertion", "cols", "device", "rows"]);
  assert.deepEqual(asks, [], "no token was asked for");
  assert.equal(node.host.spawned, 2);
});
