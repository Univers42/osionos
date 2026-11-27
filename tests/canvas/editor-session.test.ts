// The editor page's session (devil verdict 2026-11-27 trusted browser, TB4, D1, TB6): no /api/fs
// opening leaves before the app that frames it has spoken; a session secret passed between this
// page's frames goes only to a frame pinned to the same app origin; a remembered computer opens the
// editor as it opens the terminal, under the same storage key, and no credential reaches the app.
import assert from "node:assert/strict";
import test from "node:test";

import { createEditorSession, type PeerChannel } from "../../src/editor-client/session.ts";
import { rememberedStoreOver } from "../../src/features/ide/model/terminalCredentials.ts";
import type { NodeFsSocket } from "../../src/features/ide/vfs/nodeFsClient.ts";

const PROD = "https://baas.tail10f2ea.ts.net:8443";
const BETA = "https://baas-beta.tail10f2ea.ts.net";
const ORIGINS = [PROD, BETA];
const TOKEN = "osionos_mc1.abcdefgh.payload.sig";
const RESUME = "osionos_mr1.abcdefgh.payload.sig";
const DEVICE = "D".repeat(43);
const SECRET = "S".repeat(43);
const MACHINE = "m-abcdefghijklmnop";
const PEER_WAIT_MS = 20;

type Listener = (event: { data: unknown }) => void;
type Member = PeerChannel & { heard: unknown[] };

/** One BroadcastChannel name: a post reaches every other member, later, never the poster. */
function channelBus() {
  const members = new Set<{ listeners: Set<Listener>; heard: unknown[] }>();
  return (): Member => {
    const me = { listeners: new Set<Listener>(), heard: [] as unknown[] };
    members.add(me);
    return {
      heard: me.heard,
      postMessage(data) {
        for (const other of members) {
          if (other === me) continue;
          setTimeout(() => {
            other.heard.push(data);
            for (const listener of other.listeners) listener({ data: structuredClone(data) });
          }, 0);
        }
      },
      addEventListener: (_type, listener) => { me.listeners.add(listener); },
      removeEventListener: (_type, listener) => { me.listeners.delete(listener); },
    };
  };
}

class FakeSocket implements NodeFsSocket {
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  send(text: string): void { this.sent.push(text); }
  close(): void {}
  reply(message: unknown): void { this.onmessage?.({ data: JSON.stringify(message) }); }
}

const settle = (ms = PEER_WAIT_MS * 3) => new Promise((resolve) => setTimeout(resolve, ms));

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() { return items.size; },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => { items.delete(key); },
    setItem: (key, value) => { items.set(key, value); },
  };
}

function editor(join: () => Member, { storage = null as Storage | null, remembers = storage !== null } = {}) {
  const parent = {};
  const posted: Array<{ message: unknown; origin: string }> = [];
  const sockets: FakeSocket[] = [];
  let handler: (event: { source: unknown; origin: string; data: unknown }) => void = () => {};
  const reconnects: Array<() => void> = [];
  let ready = false;
  const session = createEditorSession({
    page: { self: {}, parent, top: parent }, appOrigins: ORIGINS, node: MACHINE,
    post: (message, origin) => { posted.push({ message, origin }); },
    listen: (next) => { handler = next; return () => {}; },
    whoami: async () => null,
    remembers,
    store: storage ? rememberedStoreOver(() => storage) : null,
    onAppMessage: (data) => (data as { type?: unknown } | null)?.type === "osionos-editor/theme",
    peers: join(),
    openSocket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    onState: () => {},
    later: (run) => { reconnects.push(run); },
    peerWaitMs: PEER_WAIT_MS,
  });
  assert.ok(session);
  void session.then(() => { ready = true; });
  return {
    session, posted, sockets,
    ready: () => ready,
    types: () => posted.map((p) => (p.message as { type: string }).type),
    /** The node closes the open socket; the client reconnects at once. */
    close(code: number) {
      sockets.at(-1)?.onclose?.({ code });
      reconnects.shift()?.();
    },
    deliver: (data: unknown, origin = PROD, source: unknown = parent) => handler({ source, origin, data }),
    /** Opens its socket and returns the first message it sent the node. */
    async opening(): Promise<unknown> {
      await session;
      const socket = sockets.at(-1);
      assert.ok(socket);
      socket.onopen?.();
      await settle();
      return JSON.parse(socket.sent[0] ?? "null");
    },
  };
}

test("TB4: a frame whose parent has not spoken sends no opening", async () => {
  const frame = editor(channelBus());
  frame.deliver({ type: "osionos-ide/session", token: TOKEN }, PROD, {});
  frame.deliver({ type: "osionos-ide/session", token: TOKEN }, "https://evil.example");
  await settle();
  assert.equal(frame.sockets.length, 0, "no /api/fs socket before the parent speaks");
  assert.equal(frame.ready(), false);

  frame.deliver({ type: "osionos-editor/theme", theme: {} });
  frame.deliver({ type: "osionos-ide/session", token: TOKEN });
  assert.deepEqual(await frame.opening(), { token: TOKEN, appOrigin: PROD });
});

test("TB4: a beta-pinned frame takes nothing from a live production frame on the same channel", async () => {
  const join = channelBus();
  const prod = editor(join);
  prod.deliver({ type: "osionos-ide/session", token: TOKEN });
  assert.deepEqual(await prod.opening(), { token: TOKEN, appOrigin: PROD });
  prod.sockets[0].reply({ op: "opened", secret: SECRET });

  const spy = join();
  const beta = editor(join);
  beta.deliver({ type: "osionos-ide/session", token: TOKEN }, BETA);
  assert.deepEqual(await beta.opening(), { token: TOKEN, appOrigin: BETA });
  for (const heard of spy.heard) {
    if ((heard as { secret?: unknown }).secret === SECRET) assert.equal((heard as { appOrigin?: unknown }).appOrigin, PROD);
  }

  // Positive control: a second production frame does take the secret, so the channel works.
  const prod2 = editor(join);
  prod2.deliver({ type: "osionos-ide/session", token: TOKEN });
  assert.deepEqual(await prod2.opening(), { secret: SECRET, appOrigin: PROD });
});

test("TB4: an answer that names no origin, or another one, is not taken", async () => {
  const join = channelBus();
  const liar = join();
  liar.addEventListener("message", ({ data }) => {
    if ((data as { type?: unknown }).type !== "secret?") return;
    liar.postMessage({ type: "secret", secret: SECRET });
    liar.postMessage({ type: "secret", secret: SECRET, appOrigin: PROD });
  });
  const beta = editor(join);
  beta.deliver({ type: "osionos-ide/session", token: TOKEN }, BETA);
  assert.deepEqual(await beta.opening(), { token: TOKEN, appOrigin: BETA });
});

test("D1: a remembered computer opens the editor with its device secret, the resume assertion and the pinned origin", async () => {
  const storage = memoryStorage();
  storage.setItem(`osionos-remembered:${PROD}`, DEVICE);
  const frame = editor(channelBus(), { storage });
  assert.deepEqual(frame.posted.slice(0, 2), [
    { message: { type: "osionos-ide/remembered" }, origin: PROD },
    { message: { type: "osionos-ide/ready", node: MACHINE }, origin: PROD },
  ]);
  frame.deliver({ type: "osionos-ide/resume", assertion: RESUME });
  assert.deepEqual(await frame.opening(), { device: DEVICE, assertion: RESUME, appOrigin: PROD });
  assert.deepEqual(frame.types().filter((type) => type.startsWith("osionos-ide/need")), [], "the ready's grant is the first opening: no second mint");
});

test("D1: a device secret the node issues is kept under the terminal page's key for the pinned origin", async () => {
  const storage = memoryStorage();
  const frame = editor(channelBus(), { storage });
  frame.deliver({ type: "osionos-ide/session", token: TOKEN });
  assert.deepEqual(await frame.opening(), { token: TOKEN, appOrigin: PROD });
  frame.sockets[0].reply({ op: "opened", secret: SECRET, device: DEVICE });
  assert.equal(storage.getItem(`osionos-remembered:${PROD}`), DEVICE);
  assert.equal(storage.getItem(`osionos-remembered:${BETA}`), null);

  const older = memoryStorage();
  const unremembering = editor(channelBus(), { storage: older, remembers: false });
  unremembering.deliver({ type: "osionos-ide/session", token: TOKEN });
  await unremembering.opening();
  unremembering.sockets[0].reply({ op: "opened", secret: SECRET, device: DEVICE });
  assert.equal(older.length, 0, "a node that does not remember computers has nothing kept");
});

test("D1: a refusal after a device opening forgets it, and the next opening asks for a token", async () => {
  const storage = memoryStorage();
  storage.setItem(`osionos-remembered:${PROD}`, DEVICE);
  const frame = editor(channelBus(), { storage });
  frame.deliver({ type: "osionos-ide/resume", assertion: RESUME });
  assert.deepEqual(await frame.opening(), { device: DEVICE, assertion: RESUME, appOrigin: PROD });
  frame.close(4401);
  assert.equal(storage.getItem(`osionos-remembered:${PROD}`), null);
  const reopening = frame.opening();
  await settle();
  assert.equal(frame.types().at(-1), "osionos-ide/need-session");
  frame.deliver({ type: "osionos-ide/session", token: TOKEN });
  assert.deepEqual(await reopening, { token: TOKEN, appOrigin: PROD });
});

test("D1: a refusal after a secret opening drops the secret, and the next opening asks for a token", async () => {
  const frame = editor(channelBus());
  frame.deliver({ type: "osionos-ide/session", token: TOKEN });
  await frame.opening();
  frame.sockets[0].reply({ op: "opened", secret: SECRET });
  frame.close(1006);
  assert.deepEqual(await frame.opening(), { secret: SECRET, appOrigin: PROD }, "a dropped connection keeps the secret");
  frame.close(4401);
  const reopening = frame.opening();
  await settle();
  assert.equal(frame.types().at(-1), "osionos-ide/need-session");
  frame.deliver({ type: "osionos-ide/session", token: TOKEN });
  assert.deepEqual(await reopening, { token: TOKEN, appOrigin: PROD });
});

test("TB6/R4: a beta-pinned editor does not use the device secret remembered for production", async () => {
  const storage = memoryStorage();
  storage.setItem(`osionos-remembered:${PROD}`, DEVICE);
  const frame = editor(channelBus(), { storage });
  assert.deepEqual(frame.posted.filter((p) => (p.message as { type: string }).type === "osionos-ide/remembered").map((p) => p.origin), [PROD]);
  frame.deliver({ type: "osionos-ide/resume", assertion: RESUME }, BETA);
  const opening = frame.opening();
  await settle();
  assert.equal(frame.types().at(-1), "osionos-ide/need-session", "no device secret for beta: it asks for a token");
  frame.deliver({ type: "osionos-ide/session", token: TOKEN }, BETA);
  assert.deepEqual(await opening, { token: TOKEN, appOrigin: BETA });
  assert.equal(storage.getItem(`osionos-remembered:${PROD}`), DEVICE, "production's secret is left alone");
});

test("TB6/F1: no credential and no file content reaches the app or another frame", async () => {
  const storage = memoryStorage();
  storage.setItem(`osionos-remembered:${PROD}`, DEVICE);
  const join = channelBus();
  const spy = join();
  const frame = editor(join, { storage });
  frame.deliver({ type: "osionos-ide/resume", assertion: RESUME });
  await frame.opening();
  frame.sockets[0].reply({ op: "opened", secret: SECRET, device: DEVICE });
  const { client } = await frame.session;
  const reading = client.request("read", { root: "r", rel: "notes/canary.txt" });
  frame.sockets[0].reply({ id: 1, ok: true, data: "CANARY-CONTENT", path: "/home/me/notes/canary.txt" });
  await reading;
  frame.deliver({ type: "osionos-ide/session", token: TOKEN });
  await settle();

  const toApp = JSON.stringify(frame.posted);
  for (const leaked of [DEVICE, RESUME, TOKEN, SECRET, "CANARY-CONTENT", "/home/me"]) {
    assert.equal(toApp.includes(leaked), false, `${leaked.slice(0, 12)} never posted to the app`);
  }
  assert.equal(frame.posted.every((p) => ORIGINS.includes(p.origin)), true, "posted only to the app's named origins");
  assert.equal(JSON.stringify(spy.heard).includes(DEVICE), false, "the device secret never crosses the channel");
});
