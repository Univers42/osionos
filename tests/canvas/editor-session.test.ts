// The editor page's session (devil verdict 2026-11-27 trusted browser, TB4): no /api/fs opening
// leaves before the app that frames it has spoken, and a session secret passed between this page's
// frames goes only to a frame pinned to the same app origin.
import assert from "node:assert/strict";
import test from "node:test";

import { createEditorSession, type PeerChannel } from "../../src/editor-client/session.ts";
import type { NodeFsSocket } from "../../src/features/ide/vfs/nodeFsClient.ts";

const PROD = "https://baas.tail10f2ea.ts.net:8443";
const BETA = "https://baas-beta.tail10f2ea.ts.net";
const ORIGINS = [PROD, BETA];
const TOKEN = "osionos_mc1.abcdefgh.payload.sig";
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

function editor(join: () => Member) {
  const parent = {};
  const posted: Array<{ message: unknown; origin: string }> = [];
  const sockets: FakeSocket[] = [];
  let handler: (event: { source: unknown; origin: string; data: unknown }) => void = () => {};
  let ready = false;
  const session = createEditorSession({
    page: { self: {}, parent, top: parent }, appOrigins: ORIGINS, node: MACHINE,
    post: (message, origin) => { posted.push({ message, origin }); },
    listen: (next) => { handler = next; return () => {}; },
    whoami: async () => null,
    onAppMessage: (data) => (data as { type?: unknown } | null)?.type === "osionos-editor/theme",
    peers: join(),
    openSocket: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
    onState: () => {},
    later: () => {},
    peerWaitMs: PEER_WAIT_MS,
  });
  assert.ok(session);
  void session.then(() => { ready = true; });
  return {
    session, posted, sockets,
    ready: () => ready,
    deliver: (data: unknown, origin = PROD, source: unknown = parent) => handler({ source, origin, data }),
    /** Opens its socket and returns the first message it sent the node. */
    async opening(): Promise<unknown> {
      await session;
      assert.equal(sockets.length, 1);
      sockets[0].onopen?.();
      await settle();
      return JSON.parse(sockets[0].sent[0] ?? "null");
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
