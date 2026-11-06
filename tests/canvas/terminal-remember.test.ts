// "Remember this computer" in the terminal page (devil verdict 2026-11-01, Amendment 1, R4, R9, R10,
// R11): the device secret lives in the node origin's storage, keyed by the app origin the frame
// pinned, goes out only as a socket's first message, and every storage failure is the token path.
import assert from "node:assert/strict";
import test from "node:test";

import { linkTerminalToApp } from "../../src/features/ide/model/terminalAppLink.ts";
import { rememberedStoreOver, type RememberedStore } from "../../src/features/ide/model/terminalCredentials.ts";

const PROD = "https://baas.tail10f2ea.ts.net:8443";
const BETA = "https://baas-beta.tail10f2ea.ts.net";
const ORIGINS = [PROD, BETA, "app://osionos"];
const TOKEN = "osionos_mc1.abcdefgh.payload.sig";
const RESUME = "osionos_mr1.abcdefgh.payload.sig";
const DEVICE = "D".repeat(43);
const OTHER_DEVICE = "E".repeat(43);
const MACHINE = "m-abcdefghijklmnop";

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

function world({ remembers = true, store = rememberedStoreOver(memoryStorage) as RememberedStore | null } = {}) {
  const parent = {};
  const posted: Array<{ message: unknown; origin: string }> = [];
  const forgotten: string[] = [];
  let handler: (event: { source: unknown; origin: string; data: unknown }) => void = () => {};
  const link = linkTerminalToApp({
    page: { self: {}, parent, top: parent }, appOrigins: ORIGINS, node: MACHINE,
    post: (message, origin) => { posted.push({ message, origin }); },
    listen: (next) => { handler = next; return () => {}; },
    whoami: async () => null,
    remembers, store,
    forgetOnNode: async (device) => { forgotten.push(device); },
  });
  assert.ok(link);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { link, posted, forgotten, store, settle, deliver: (data: unknown, origin = PROD) => handler({ source: parent, origin, data }) };
}

const types = (posted: Array<{ message: unknown }>) => posted.map((p) => (p.message as { type: string }).type);
const persisted = (storage: Storage) => rememberedStoreOver(() => storage);

test("R4: the device secret is kept under the pinned app origin only; the beta's frame finds none and takes the token path", async () => {
  const storage = memoryStorage();
  const prod = world({ store: persisted(storage) });
  prod.deliver({ type: "osionos-ide/session", token: TOKEN });
  assert.deepEqual(await prod.link.credentials.take(), { token: TOKEN, appOrigin: PROD });
  prod.link.credentials.keepDevice(DEVICE);
  assert.equal(storage.getItem(`osionos-remembered:${PROD}`), DEVICE);

  const beta = world({ store: persisted(storage) });
  assert.deepEqual(beta.posted.filter((p) => types([p])[0] === "osionos-ide/remembered").map((p) => p.origin), [PROD], "remembered is said to production only");
  beta.deliver({ type: "osionos-ide/resume", assertion: RESUME }, BETA);
  const taking = beta.link.credentials.take();
  await beta.settle();
  assert.equal(types(beta.posted).at(-1), "osionos-ide/need-session", "an assertion with no secret for this origin asks for a token");
  beta.deliver({ type: "osionos-ide/session", token: TOKEN }, BETA);
  assert.deepEqual(await taking, { token: TOKEN, appOrigin: BETA });
});

test("R4: a remembered frame opens with the secret, the resume assertion and its origin; a refusal drops the secret", async () => {
  const storage = memoryStorage();
  storage.setItem(`osionos-remembered:${PROD}`, DEVICE);
  const w = world({ store: persisted(storage) });
  assert.deepEqual(w.posted.slice(0, 2), [{ message: { type: "osionos-ide/remembered" }, origin: PROD }, { message: { type: "osionos-ide/ready", node: MACHINE }, origin: PROD }]);
  w.deliver({ type: "osionos-ide/resume", assertion: RESUME });
  assert.deepEqual(await w.link.credentials.take(), { device: DEVICE, assertion: RESUME, appOrigin: PROD });
  w.link.credentials.dropDevice();
  assert.equal(storage.getItem(`osionos-remembered:${PROD}`), null);
});

test("R10: only a token, a resume assertion and forget act; a parent message carrying a secret or a device does nothing", async () => {
  const storage = memoryStorage();
  storage.setItem(`osionos-remembered:${PROD}`, DEVICE);
  const w = world({ store: persisted(storage) });
  const before = w.posted.length;
  for (const data of [
    { type: "osionos-ide/session", token: TOKEN, device: OTHER_DEVICE }, { type: "osionos-ide/resume", assertion: RESUME, secret: OTHER_DEVICE },
    { type: "osionos-ide/forget", device: OTHER_DEVICE }, { type: "osionos-ide/remember", device: OTHER_DEVICE }, { device: OTHER_DEVICE }, { secret: OTHER_DEVICE },
    { type: "osionos-ide/resume", assertion: TOKEN }, { type: "osionos-ide/session", token: RESUME },
  ]) w.deliver(data);
  await w.settle();
  assert.equal(w.posted.length, before);
  assert.equal(storage.getItem(`osionos-remembered:${PROD}`), DEVICE);
  assert.deepEqual(w.forgotten, []);
  assert.equal(w.link.appOrigin(), null, "nothing pinned the frame");
});

test("R8: forget from the pinned parent drops the frame's secret, tells the node, and answers forgotten", async () => {
  const storage = memoryStorage();
  storage.setItem(`osionos-remembered:${PROD}`, DEVICE);
  storage.setItem(`osionos-remembered:${BETA}`, OTHER_DEVICE);
  const w = world({ store: persisted(storage) });
  w.deliver({ type: "osionos-ide/forget" });
  await w.settle();
  assert.deepEqual(w.forgotten, [DEVICE]);
  assert.equal(storage.getItem(`osionos-remembered:${PROD}`), null);
  assert.equal(storage.getItem(`osionos-remembered:${BETA}`), OTHER_DEVICE, "the beta's secret is the beta's to forget");
  assert.deepEqual(w.posted.at(-1), { message: { type: "osionos-ide/forgotten" }, origin: PROD });
});

test("R9: no message the frame posts ever carries a device secret, over remember, reload and open", async () => {
  const storage = memoryStorage();
  const first = world({ store: persisted(storage) });
  first.deliver({ type: "osionos-ide/session", token: TOKEN });
  await first.link.credentials.take();
  first.link.credentials.keepDevice(DEVICE);
  const reload = world({ store: persisted(storage) });
  reload.deliver({ type: "osionos-ide/resume", assertion: RESUME });
  const opening = await reload.link.credentials.take();
  assert.equal("device" in opening && opening.device, DEVICE, "the socket gets it");
  reload.link.credentials.dropSecret();
  const asking = reload.link.credentials.take();
  await reload.settle();
  assert.equal(types(reload.posted).at(-1), "osionos-ide/need-resume", "an app that sent a resume is asked for another");
  reload.deliver({ type: "osionos-ide/resume", assertion: RESUME });
  await asking;
  for (const { message } of [...first.posted, ...reload.posted]) assert.equal(JSON.stringify(message).includes(DEVICE), false, JSON.stringify(message));
});

test("R11: storage that throws, was purged, or holds junk remembers nothing and never throws", async () => {
  const throwing = rememberedStoreOver(() => { throw new DOMException("denied", "SecurityError"); });
  assert.equal(throwing.read(PROD), null);
  assert.doesNotThrow(() => throwing.write(PROD, DEVICE));
  assert.doesNotThrow(() => throwing.remove(PROD));
  const junk = memoryStorage();
  junk.setItem(`osionos-remembered:${PROD}`, "not a secret");
  assert.equal(persisted(junk).read(PROD), null);
  for (const store of [throwing, persisted(memoryStorage()), persisted(junk)]) {
    const w = world({ store });
    assert.equal(types(w.posted).includes("osionos-ide/remembered"), false);
    const taking = w.link.credentials.take();
    await w.settle();
    assert.equal(types(w.posted).at(-1), "osionos-ide/need-session");
    w.deliver({ type: "osionos-ide/session", token: TOKEN });
    assert.deepEqual(await taking, { token: TOKEN, appOrigin: PROD });
  }
});

test("R14: against a node that does not remember, the frame names no origin and says nothing new", async () => {
  const storage = memoryStorage();
  storage.setItem(`osionos-remembered:${PROD}`, DEVICE);
  const w = world({ remembers: false, store: persisted(storage) });
  assert.deepEqual(types(w.posted), ["osionos-ide/ready", "osionos-ide/ready", "osionos-ide/ready"]);
  w.deliver({ type: "osionos-ide/session", token: TOKEN });
  assert.deepEqual(await w.link.credentials.take(), { token: TOKEN });
  w.link.credentials.keepDevice(OTHER_DEVICE);
  assert.equal(storage.getItem(`osionos-remembered:${PROD}`), DEVICE, "nothing is written either");
});
