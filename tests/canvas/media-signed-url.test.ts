/**
 * osionos#233 D233-2/3/5 at the render seam: the fetch transport the app signs through, and the
 * hook every media element uses. While signing is off every element renders its stored URL; a
 * non-bridge URL is never touched; a loaded element is never re-sourced, and an error re-signs once.
 */

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createFetchSignTransport } from "@/shared/lib/media/appMediaSigner";
import { createMediaSigner, type SignAnswer } from "@/shared/lib/media/mediaSigner";
import { MediaPageContext, mountedMediaSrc, retriedMediaSrc, useSignedMediaUrl } from "@/shared/lib/media/useSignedMediaUrl";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const path = (owner: string, n: number) => `/api/media/uploads/${owner}/${n.toString(16).padStart(64, "0")}.png`;
const NOW_MS = Date.UTC(2026, 10, 22, 10, 5);
const signedOf = (p: string) => `${p}?exp=${Date.UTC(2026, 10, 22, 12) / 1000}&kid=0a1b2c3d&sig=${"f".repeat(64)}`;

function answering(answer: (paths: string[], pageId: string | null) => SignAnswer) {
  const calls: Array<{ paths: string[]; pageId: string | null }> = [];
  const signer = createMediaSigner({
    transport: async (paths, pageId) => { calls.push({ paths, pageId }); return answer(paths, pageId); },
    nowMs: () => NOW_MS,
    userId: () => ME,
  });
  return { calls, signer };
}
const signAll = (paths: string[]): SignAnswer => ({ kind: "signed", signed: Object.fromEntries(paths.map((p) => [p, signedOf(p)])), serverNowSec: NOW_MS / 1000 });

function Probe({ url, pageId, signer }: { url: string; pageId?: string; signer: ReturnType<typeof answering>["signer"] }) {
  const { src } = useSignedMediaUrl(url, pageId, signer);
  return React.createElement("img", { src, alt: "" });
}
const render = (element: React.ReactElement) => renderToStaticMarkup(element);
// React 19 adds a <link rel="preload"> for an <img src>, so a bare element is the reference.
const plainImg = (src: string) => render(React.createElement("img", { src, alt: "" }));

test("a URL that is not a bridge upload renders byte-identical, with no request", () => {
  const { calls, signer } = answering(signAll);
  for (const url of ["https://images.unsplash.com/x.jpg?w=1&amp;h=2", "data:image/png;base64,AAAA", "/api/media/avatars/a.png"]) {
    assert.equal(render(React.createElement(Probe, { url, signer })), plainImg(url));
  }
  assert.equal(calls.length, 0);
});

test("signing off: every upload renders its stored URL at once, and no request is made", async () => {
  const { calls, signer } = answering(() => ({ kind: "off" }));
  await signer.sign(path(ME, 1));
  const stored = path(ME, 2);
  assert.equal(render(React.createElement(Probe, { url: stored, signer })), plainImg(stored));
  assert.equal(calls.length, 1);
});

test("a cached link renders signed on mount; a pending one renders no src until it is signed", async () => {
  const { signer } = answering(signAll);
  assert.equal(render(React.createElement(Probe, { url: path(ME, 3), signer })), `<img alt=""/>`);
  await signer.sign(path(ME, 3));
  assert.match(render(React.createElement(Probe, { url: path(ME, 3), signer })), /sig=f{64}/);
});

test("the page context gives a foreign upload its authority", async () => {
  const { calls, signer } = answering(signAll);
  const foreign = path(OTHER, 4);
  assert.equal(mountedMediaSrc(foreign, "page-1", signer), undefined);
  await signer.sign(foreign, "page-1");
  assert.deepEqual(calls, [{ paths: [foreign], pageId: "page-1" }]);
  const html = render(React.createElement(MediaPageContext.Provider, { value: "page-1" }, React.createElement(Probe, { url: foreign, signer })));
  assert.match(html, /sig=/);
});

test("D233-5: an error re-signs once, then the element keeps its broken state", async () => {
  const { calls, signer } = answering(signAll);
  const stored = path(ME, 5);
  await signer.sign(stored);
  const mounted = mountedMediaSrc(stored, null, signer);
  assert.match(String(mounted), /sig=/);
  const retry = await retriedMediaSrc(stored, null, signer, false);
  assert.match(String(retry), /sig=/);
  assert.equal(calls.length, 2, "the error asked once more");
  assert.equal(await retriedMediaSrc(stored, null, signer, true), null, "no second retry");
  assert.equal(calls.length, 2);
});

test("transport: a 503 is off, a 200 is the signed map with the bridge clock, the rest failed", async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const reply = (status: number, body: unknown) => async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  const transport = (fetchImpl: typeof fetch, token: string | null = "tok") => createFetchSignTransport({ apiBase: "https://bridge.example", fetchImpl, token: () => token });
  assert.deepEqual(await transport(reply(503, { ok: false }) as typeof fetch)([path(ME, 1)], null), { kind: "off" });
  assert.deepEqual(await transport(reply(200, { ok: true, signed: { a: "b" }, now: 1700000000 }) as typeof fetch)(["a"], "page-9"),
    { kind: "signed", signed: { a: "b" }, serverNowSec: 1700000000 });
  assert.equal(seen[1].url, "https://bridge.example/api/media/uploads/sign");
  assert.equal((seen[1].init.headers as Record<string, string>).authorization, "Bearer tok");
  assert.deepEqual(JSON.parse(String(seen[1].init.body)), { pageId: "page-9", paths: ["a"] });
  assert.deepEqual(JSON.parse(String(seen[0].init.body)), { paths: [path(ME, 1)] });
  assert.deepEqual(await transport(reply(429, {}) as typeof fetch)(["a"], null), { kind: "failed" });
  assert.deepEqual(await transport((async () => { throw new TypeError("offline"); }) as typeof fetch)(["a"], null), { kind: "failed" });
  const before = seen.length;
  assert.deepEqual(await transport(reply(200, {}) as typeof fetch, null)(["a"], null), { kind: "failed" });
  assert.deepEqual(await createFetchSignTransport({ apiBase: "", fetchImpl: reply(200, {}) as typeof fetch, token: () => "t" })(["a"], null), { kind: "off" });
  assert.equal(seen.length, before, "no token or no bridge: no request");
});

test("N1: the app signer starts off: an upload renders its stored URL at first paint and nothing is posted", async () => {
  const posted: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => { posted.push(String(input)); return new Response(null, { status: 503 }); }) as typeof fetch;
  try {
    const stored = path(ME, 77);
    assert.equal(mountedMediaSrc(stored, null), stored);
    assert.equal(mountedMediaSrc(stored, "page-1"), stored);
    await new Promise((done) => setTimeout(done, 0));
    assert.deepEqual(posted.filter((url) => url.includes("/api/media/uploads/sign")), []);
  } finally {
    globalThis.fetch = realFetch;
  }
});
