/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   minted-topic-socket.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/18 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/18 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  createTopicTokenFetcher,
  openMintedSocket,
  tokenRequestForTopic,
} from "../../src/services/realtime-messages/mintedTopicSocket.ts";
import type { LiveSocketOptions } from "../../src/shared/notion-database-sys/src/store/live/liveRealtimeSocket.ts";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("only chat and user topics map to a token request", () => {
  assert.deepEqual(tokenRequestForTopic("chat:ws-1:chan-1"), { kind: "chat", channelId: "chan-1" });
  assert.deepEqual(tokenRequestForTopic("user:abc"), { kind: "user", subject: "abc" });
  for (const topic of ["feed:ws-1", "presence:ws-1", "collab:x", "table:db:t", "chat:*", "chat:a:b:c", "user:", ""]) {
    assert.equal(tokenRequestForTopic(topic), null, topic);
  }
});

test("the fetcher posts the request with the session jwt and returns the token", async () => {
  const calls: unknown[][] = [];
  const fetchToken = createTopicTokenFetcher({
    getJwt: () => "session-jwt",
    post: async (path, body, jwt) => { calls.push([path, body, jwt]); return { token: "minted" }; },
  });
  assert.equal(await fetchToken("chat:ws-1:chan-1"), "minted");
  assert.deepEqual(calls, [["/api/realtime/token", { kind: "chat", channelId: "chan-1" }, "session-jwt"]]);
});

test("the fetcher is null without a session, for other topics and on failure", async () => {
  const post = async () => { throw new Error("403"); };
  assert.equal(await createTopicTokenFetcher({ getJwt: () => null, post })("user:abc"), null);
  assert.equal(await createTopicTokenFetcher({ getJwt: () => "j", post })("feed:ws-1"), null);
  assert.equal(await createTopicTokenFetcher({ getJwt: () => "j", post })("user:abc"), null);
  assert.equal(await createTopicTokenFetcher({ getJwt: () => "j", post: async () => ({}) })("user:abc"), null);
});

function harness(tokens: Array<string | null>) {
  const created: LiveSocketOptions[] = [];
  const log = { started: 0, stopped: 0 };
  const queue = [...tokens];
  const handle = openMintedSocket({
    url: "ws://x",
    topic: "chat:w:c",
    onEvent: () => undefined,
    fetchToken: async () => queue.shift() ?? null,
    createSocket: (options) => {
      created.push(options);
      return { start: () => { log.started += 1; }, stop: () => { log.stopped += 1; } };
    },
  });
  return { created, log, handle };
}

test("the socket starts with the minted token and re-mints on every drop", async () => {
  const { created, log } = harness(["t1", "t2"]);
  await tick();
  assert.equal(created.length, 1);
  assert.equal(log.started, 1);
  assert.equal(created[0].token, "t1");
  created[0].onDown?.();
  await tick();
  assert.equal(created[0].token, "t2", "the next AUTH reads the fresh token");
});

test("no socket opens when the first mint fails", async () => {
  const { created, handle } = harness([null]);
  await tick();
  assert.equal(created.length, 0);
  handle.stop(); // the failed mint keeps retrying until stopped
});

test("stop before the mint resolves never opens a socket; stop after closes it", async () => {
  const early = harness(["t1"]);
  early.handle.stop();
  await tick();
  assert.equal(early.created.length, 0);

  const late = harness(["t1"]);
  await tick();
  late.handle.stop();
  assert.equal(late.log.stopped, 1);
});

function retryHarness(tokens: Array<string | null>) {
  const created: LiveSocketOptions[] = [];
  const log = { stopped: 0, delays: [] as number[] };
  const pending: Array<() => void> = [];
  const queue = [...tokens];
  const handle = openMintedSocket({
    url: "ws://x",
    topic: "chat:w:c",
    onEvent: () => undefined,
    fetchToken: async () => queue.shift() ?? null,
    createSocket: (options) => {
      created.push(options);
      return { start: () => undefined, stop: () => { log.stopped += 1; } };
    },
    schedule: (run, ms) => { log.delays.push(ms); pending.push(run); return () => { pending.length = 0; }; },
  });
  const fire = async () => { pending.shift()?.(); await tick(); };
  return { created, log, handle, fire, pending };
}

test("a failed first mint is retried with a growing, capped delay until it succeeds", async () => {
  const { created, log, fire } = retryHarness([null, null, null, null, null, null, null, null, "t1"]);
  await tick();
  for (let attempt = 0; attempt < 8; attempt += 1) await fire();
  assert.equal(created.length, 1, "the socket opens once a mint finally works");
  assert.equal(created[0].token, "t1");
  assert.deepEqual(log.delays, [2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
});

test("a permanent auth failure re-mints and opens a fresh socket", async () => {
  const { created, log, fire } = retryHarness(["t1", "t2"]);
  await tick();
  created[0].onPermanentFailure?.("auth failed");
  assert.equal(log.stopped, 1, "the dead socket is released");
  await fire();
  assert.equal(created.length, 2);
  assert.equal(created[1].token, "t2");
});

test("a live subscription resets the backoff", async () => {
  const { created, log, fire } = retryHarness(["t1", null, "t3"]);
  await tick();
  created[0].onUp?.();
  created[0].onPermanentFailure?.("auth failed");
  await fire();
  await fire();
  assert.deepEqual(log.delays, [2000, 4000]);
  created[1].onUp?.();
  created[1].onPermanentFailure?.("auth failed");
  assert.equal(log.delays.at(-1), 2000);
});

test("stop cancels a pending retry", async () => {
  const { created, handle, fire, pending } = retryHarness([null, "t1"]);
  await tick();
  assert.equal(pending.length, 1);
  handle.stop();
  await fire();
  assert.equal(created.length, 0);
});
