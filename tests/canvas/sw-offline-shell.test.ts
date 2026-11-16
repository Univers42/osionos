/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sw-offline-shell.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #176: a reload without a connection showed the browser's offline page, and the app
// could not be installed. 2026-11-16: answering online navigations hid the page's own
// server address from Firefox 158, so every bridge call waited on a local-network check. public/sw.js runs here in a fake worker scope: its own
// install and fetch handlers, a Map-backed Cache Storage and a scripted network.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ORIGIN = "https://osionos.test";
const SOURCE = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
const SHELL = `<script type="module" crossorigin src="/assets/index-a1.js"></script>
<link rel="modulepreload" crossorigin href="/assets/vendor-b2.js">
<link rel="stylesheet" crossorigin href="/assets/index-c3.css">`;

type FakeRequest = { url: string; method: string; mode: string };
type Handler = (event: Record<string, unknown>) => void;
const keyOf = (request: string | FakeRequest) => new URL(typeof request === "string" ? request : request.url, ORIGIN).href;

/** A worker scope over `network`; `online` flips what the network does, `link` what the browser reports. */
function boot() {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Response>();
  const world = { online: true, link: true, tookOver: false, fetched: [] as string[] };
  const network = async (request: string | FakeRequest) => {
    const url = keyOf(request);
    world.fetched.push(url);
    if (!world.online) throw new TypeError("Failed to fetch");
    // Like the deployed app: every app path answers with the shell, a file with itself.
    if (!new URL(url).pathname.includes(".")) return new Response(SHELL, { headers: { "content-type": "text/html" } });
    return new Response(`file ${url}`, { headers: { "content-type": "application/octet-stream" } });
  };
  const cache = {
    match: async (request: string | FakeRequest) => store.get(keyOf(request))?.clone(),
    put: async (request: string | FakeRequest, response: Response) => { store.set(keyOf(request), response); },
    addAll: async (requests: string[]) => { for (const request of requests) store.set(keyOf(request), await network(request)); },
    keys: async () => [...store.keys()].map((url) => ({ url, method: "GET", mode: "cors" })),
    delete: async (request: string | FakeRequest) => store.delete(keyOf(request)),
  };
  const caches = { open: async () => cache, keys: async () => ["osionos-shell-v0"], delete: async () => true };
  const scope = {
    addEventListener: (type: string, handler: Handler) => { handlers[type] = handler; },
    location: { origin: ORIGIN },
    navigator: { get onLine() { return world.link; } },
    clients: { claim: async () => undefined },
    skipWaiting: async () => { world.tookOver = true; },
  };
  new Function("self", "caches", "fetch", SOURCE)(scope, caches, network);
  return { handlers, store, world };
}

/** Fires one event at the worker; resolves with its answer (null when it let the browser handle it). */
async function fire(handler: Handler, request?: FakeRequest): Promise<Response | null> {
  let answer: Promise<Response> | null = null;
  const pending: Promise<unknown>[] = [];
  handler({ request, respondWith: (value: Promise<Response>) => { answer = Promise.resolve(value); }, waitUntil: (value: Promise<unknown>) => pending.push(value) });
  await Promise.all(pending);
  return answer ? await answer : null;
}

const navigation = (path: string): FakeRequest => ({ url: `${ORIGIN}${path}`, method: "GET", mode: "navigate" });
const file = (path: string, method = "GET"): FakeRequest => ({ url: `${ORIGIN}${path}`, method, mode: "cors" });

test("installing keeps the app shell and every build file it names", async () => {
  const { handlers, store } = boot();
  await fire(handlers.install);
  for (const path of ["/", "/assets/index-a1.js", "/assets/vendor-b2.js", "/assets/index-c3.css"]) {
    assert.ok(store.has(`${ORIGIN}${path}`), `${path} is kept`);
  }
});

test("a new worker takes over at once: a fix must not wait for every app tab to close", async () => {
  const { handlers, world } = boot();
  await fire(handlers.install);
  assert.equal(world.tookOver, true);
});

test("a reload without a connection opens the last app shell, on any app path", async () => {
  const { handlers, world } = boot();
  await fire(handlers.install);
  Object.assign(world, { online: false, link: false });
  for (const path of ["/", "/?home=1", "/p/some-token"]) {
    const answer = await fire(handlers.fetch, navigation(path));
    assert.equal(await answer?.text(), SHELL, path);
  }
});

test("online, the browser loads the page itself and the kept shell is refreshed", async () => {
  const { handlers, store } = boot();
  assert.equal(await fire(handlers.fetch, navigation("/?home=1")), null);
  assert.equal(await store.get(`${ORIGIN}/`)?.text(), SHELL);
});

test("with the browser online and the server down, the browser still loads the page", async () => {
  const { handlers, world } = boot();
  await fire(handlers.install);
  world.online = false;
  assert.equal(await fire(handlers.fetch, navigation("/")), null);
});

test("a file opened in a tab does not replace the kept shell", async () => {
  const { handlers, world } = boot();
  await fire(handlers.install);
  await fire(handlers.fetch, navigation("/favicon.svg"));
  Object.assign(world, { online: false, link: false });
  assert.equal(await (await fire(handlers.fetch, navigation("/")))?.text(), SHELL);
});

test("a build file once fetched is served from the cache, also offline", async () => {
  const { handlers, world } = boot();
  assert.equal(await (await fire(handlers.fetch, file("/assets/lazy-d4.js")))?.text(), `file ${ORIGIN}/assets/lazy-d4.js`);
  world.online = false;
  world.fetched.length = 0;
  assert.equal(await (await fire(handlers.fetch, file("/assets/lazy-d4.js")))?.text(), `file ${ORIGIN}/assets/lazy-d4.js`);
  assert.deepEqual(world.fetched, []);
});

test("the bridge, other origins and writes are never intercepted", async () => {
  const { handlers } = boot();
  assert.equal(await fire(handlers.fetch, file("/api/pages")), null);
  assert.equal(await fire(handlers.fetch, navigation("/api/auth/callback?code=x")), null, "an OAuth return reaches the bridge");
  assert.equal(await fire(handlers.fetch, { url: "https://bridge.test/assets/x.js", method: "GET", mode: "cors" }), null);
  assert.equal(await fire(handlers.fetch, file("/assets/index-a1.js", "POST")), null);
});

test("the page links a web app manifest that names the app, its start and its icon", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  assert.match(html, /<link rel="manifest" href="\/manifest.webmanifest"/);
  const manifest = JSON.parse(readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.name, "osionos");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon: { src: string }) => icon.src === "/favicon.svg"));
});
