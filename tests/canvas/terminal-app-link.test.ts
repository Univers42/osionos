// The web terminal page's link to the app that frames it (devil verdict 2026-11-01, W10): it starts
// only as a frame of the top page, hears only that parent from one of the node's app origins, pins
// the first, posts only to it, and acts only on a token, a hello (relayed to the node's whoami) and
// colours. A token goes to the next shell's socket and nowhere else.
import assert from "node:assert/strict";
import test from "node:test";

import { linkTerminalToApp } from "../../src/features/ide/model/terminalAppLink.ts";

const PROD = "https://baas.tail10f2ea.ts.net:8443";
const BETA = "https://baas-beta.tail10f2ea.ts.net";
const ORIGINS = [PROD, BETA, "app://osionos"];
const TOKEN = "osionos_mc1.abcdefgh.payload.sig";
const NONCE = "n".repeat(22);
const SIG = "s".repeat(86);
const MACHINE = "m-abcdefghijklmnop";

type Event = { source: unknown; origin: string; data: unknown };

function world({ framed = true, top = true } = {}) {
  const parent = {};
  const self = {};
  const page = { self, parent: framed ? parent : self, top: top ? (framed ? parent : self) : {} };
  const posted: Array<{ message: unknown; origin: string }> = [];
  let handler: (event: Event) => void = () => {};
  const whoamis: string[] = [];
  const link = linkTerminalToApp({
    page, appOrigins: ORIGINS, node: MACHINE,
    post: (message, origin) => { if (origin === "*") throw new Error("never *"); posted.push({ message, origin }); },
    listen: (next) => { handler = next; return () => {}; },
    whoami: async (nonce) => { whoamis.push(nonce); return { type: "osionos-ide/identity", machineId: MACHINE, sig: SIG }; },
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { link, posted, whoamis, settle, deliver: (data: unknown, origin = PROD, source: unknown = parent) => handler({ source, origin, data }) };
}

test("a top-level page, or a frame of another frame, draws nothing and posts nothing", () => {
  for (const options of [{ framed: false }, { framed: true, top: false }]) {
    const w = world(options);
    assert.equal(w.link, null, JSON.stringify(options));
    assert.deepEqual(w.posted, []);
  }
});

test("ready names the node to each app origin, never *; the first answer pins the origin", async () => {
  const w = world();
  assert.deepEqual(w.posted.map((p) => p.origin), ORIGINS);
  assert.ok(w.posted.every((p) => (p.message as { type: string }).type === "osionos-ide/ready"));
  w.posted.length = 0;
  w.deliver({ type: "osionos-ide/hello", nonce: NONCE }, BETA);
  await w.settle();
  assert.deepEqual(w.posted, [{ message: { type: "osionos-ide/identity", machineId: MACHINE, sig: SIG }, origin: BETA }]);
  w.deliver({ type: "osionos-ide/hello", nonce: NONCE }, PROD);
  await w.settle();
  assert.equal(w.whoamis.length, 1, "after pinning, another app origin is not heard");
});

test("another source or an origin that is not an app origin is ignored", async () => {
  const w = world();
  w.posted.length = 0;
  w.deliver({ type: "osionos-ide/hello", nonce: NONCE }, PROD, {});
  w.deliver({ type: "osionos-ide/hello", nonce: NONCE }, "https://evil.example");
  w.deliver({ type: "osionos-ide/session", token: TOKEN }, "http://127.0.0.1:4100");
  await w.settle();
  assert.deepEqual([w.whoamis, w.posted], [[], []]);
});

test("a token feeds the next shell; colours are taken once; a write or anything else does nothing", async () => {
  const w = world();
  w.deliver({ type: "osionos-terminal/colors", colors: { background: "#101010", foreground: "javascript:x" } });
  assert.deepEqual(await w.link!.colors, { background: "#101010" });
  w.deliver({ type: "osionos-ide/session", token: TOKEN });
  assert.deepEqual(await w.link!.credentials.take(), { token: TOKEN });
  w.posted.length = 0;
  for (const junk of [{ op: "write", data: "rm -rf ~\r" }, { type: "osionos-ide/open", path: "a.txt" }, { type: "osionos-terminal/colors", colors: { background: "#fff" } }, "x", null]) w.deliver(junk);
  await w.settle();
  assert.deepEqual(w.posted, []);
});

test("the token never leaves the frame's memory: no post carries it, no storage, no log", async () => {
  const stored: string[] = [];
  const storage = { setItem: (k: string, v: string) => stored.push(`${k}=${v}`) };
  Reflect.set(globalThis, "localStorage", storage);
  Reflect.set(globalThis, "sessionStorage", storage);
  const logged: unknown[] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  for (const name of ["log", "warn", "error"] as const) console[name] = (...args: unknown[]) => { logged.push(args); };
  try {
    const w = world();
    w.deliver({ type: "osionos-ide/session", token: TOKEN });
    await w.link!.credentials.take();
    w.link!.report("connected");
    await w.settle();
    assert.ok(!JSON.stringify(w.posted).includes(TOKEN));
    assert.deepEqual([stored, logged], [[], []]);
  } finally {
    Object.assign(console, original);
    Reflect.deleteProperty(globalThis, "localStorage");
    Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});

test("a shell needing a token asks the pinned app once; a failed whoami reports an error, not an identity", async () => {
  const w = world();
  w.deliver({ type: "osionos-ide/session", token: TOKEN });
  await w.link!.credentials.take();
  w.posted.length = 0;
  void w.link!.credentials.take();
  assert.deepEqual(w.posted, [{ message: { type: "osionos-ide/need-session" }, origin: PROD }]);
});
