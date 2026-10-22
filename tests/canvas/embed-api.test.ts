/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   embed-api.test.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EmbedUrlError,
  clearEmbedCache,
  createEmbedResolver,
  type EmbedTransport,
} from "../../src/shared/lib/embed/embedApi.ts";

const fixture: unknown = JSON.parse(
  readFileSync(new URL("../fixtures/embed-info.sample.json", import.meta.url), "utf8"),
);

function stubTransport(reply: () => Promise<unknown>, available = true) {
  const calls: string[] = [];
  const transport: EmbedTransport = {
    isAvailable: () => available,
    resolve: (url) => {
      calls.push(url);
      return reply();
    },
  };
  return { transport, calls };
}

const GENERIC = "https://blog.example/post";
const genericReply = { embed: { ...(fixture as object), url: GENERIC, kind: "link", provider: null, player: null } };

test("a provider URL resolves offline without calling the transport", async () => {
  clearEmbedCache();
  const { transport, calls } = stubTransport(() => Promise.reject(new Error("never")), false);
  const info = await createEmbedResolver(transport)("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(info.kind, "video");
  assert.equal(info.player?.src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.deepEqual(calls, []);
});

test("a scheme-less provider link resolves", async () => {
  clearEmbedCache();
  const { transport } = stubTransport(() => Promise.reject(new Error("down")), false);
  const info = await createEmbedResolver(transport)("youtu.be/jNQXAC9IVRw");
  assert.equal(info.url, "https://youtu.be/jNQXAC9IVRw");
});

test("a provider URL is enriched with the bridge's title but keeps its own player", async () => {
  clearEmbedCache();
  const reply = { embed: { ...(fixture as object), url: "https://youtu.be/dQw4w9WgXcQ", title: "Never Gonna", player: { src: "https://evil.example/p", aspect: "1/1" } } };
  const { transport, calls } = stubTransport(() => Promise.resolve(reply));
  const info = await createEmbedResolver(transport)("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(info.title, "Never Gonna");
  assert.equal(info.player?.src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(calls.length, 1);
});

test("a provider URL falls back to provider-only info when the bridge fails or is slow", async () => {
  clearEmbedCache();
  const failing = stubTransport(() => Promise.reject(new Error("502")));
  const failed = await createEmbedResolver(failing.transport)("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(failed.title, "");
  assert.equal(failed.kind, "video");
  clearEmbedCache();
  const slow = stubTransport(() => new Promise(() => undefined));
  const started = Date.now();
  const timedOut = await createEmbedResolver(slow.transport, { enrichTimeoutMs: 30 })("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(timedOut.kind, "video");
  assert.ok(Date.now() - started < 1000);
});

test("a generic URL calls the transport once and caches the result", async () => {
  clearEmbedCache();
  const { transport, calls } = stubTransport(() => Promise.resolve(genericReply));
  const resolve = createEmbedResolver(transport);
  const [first, second] = await Promise.all([resolve(GENERIC), resolve(GENERIC)]);
  const third = await resolve(` ${GENERIC} `);
  assert.deepEqual(calls, [GENERIC]);
  assert.equal(first.title, "The New Vimeo Player (You Know, For Videos)");
  assert.equal(second, first);
  assert.equal(third, first);
});

test("a malformed bridge reply degrades to a hostname-only link and is not cached", async () => {
  clearEmbedCache();
  const malformed = [{}, { embed: null }, { embed: { url: GENERIC, kind: "iframe" } }, { embed: { kind: "link", url: "javascript:alert(1)" } }, null, "x"];
  for (const reply of malformed) {
    clearEmbedCache();
    const { transport, calls } = stubTransport(() => Promise.resolve(reply));
    const resolve = createEmbedResolver(transport);
    const info = await resolve("https://www.blog.example/post");
    assert.deepEqual(info, {
      url: "https://www.blog.example/post", kind: "link", provider: null, title: "blog.example",
      description: "", siteName: "blog.example", image: "", favicon: "", player: null, media: null, frameable: null,
    });
    await resolve("https://www.blog.example/post");
    assert.equal(calls.length, 2, "degraded results are retried, not cached");
  }
});

test("a transport failure or no bridge degrades to a link card", async () => {
  clearEmbedCache();
  const failing = stubTransport(() => Promise.reject(new Error("network")));
  assert.equal((await createEmbedResolver(failing.transport)(GENERIC)).kind, "link");
  clearEmbedCache();
  const offline = stubTransport(() => Promise.resolve(genericReply), false);
  assert.equal((await createEmbedResolver(offline.transport)(GENERIC)).frameable, null);
  assert.deepEqual(offline.calls, []);
});

test("an unsafe URL rejects with EmbedUrlError and never reaches the transport", async () => {
  clearEmbedCache();
  const { transport, calls } = stubTransport(() => Promise.resolve(genericReply));
  const resolve = createEmbedResolver(transport);
  for (const url of ["", "  ", "javascript:alert(1)", "data:text/html,x", "//evil.example/x", "https://u:p@x.example/", "file:///etc/passwd", "https://" + "a".repeat(2100)]) {
    await assert.rejects(resolve(url), EmbedUrlError, JSON.stringify(url.slice(0, 40)));
  }
  assert.deepEqual(calls, []);
});

test("the cache is bounded: the oldest entry is evicted past 200", async () => {
  clearEmbedCache();
  const { transport, calls } = stubTransport(() => Promise.resolve(genericReply));
  const resolve = createEmbedResolver(transport);
  for (let i = 0; i < 201; i += 1) await resolve(`https://blog.example/p${i}`);
  assert.equal(calls.length, 201);
  await resolve("https://blog.example/p200");
  assert.equal(calls.length, 201, "newest still cached");
  await resolve("https://blog.example/p0");
  assert.equal(calls.length, 202, "oldest was evicted");
});
