/**
 * osionos#233 D233-2 … D233-5: the client signer. Batches by authority (own paths with no pageId,
 * foreign ones per page), fails open with a negative cache, keeps links for a lifetime measured on
 * the bridge's clock, and never re-signs on its own: only a mount or an error asks again.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createMediaSigner, parseSignAnswer, type SignAnswer } from "@/shared/lib/media/mediaSigner";

const ME = "11111111-1111-4111-8111-111111111111";
const HOUR = 3600;
const upload = (owner: string, n: number) => `/api/media/uploads/${owner}/${n.toString(16).padStart(64, "0")}.png`;
const foreigner = (n: number) => `${n.toString(16).padStart(8, "0")}-2222-4222-8222-222222222222`;
const expAfter = (nowSec: number) => (Math.ceil(nowSec / HOUR) + 1) * HOUR;
const signedOf = (path: string, exp: number) => `${path}?exp=${exp}&kid=0a1b2c3d&sig=${"f".repeat(64)}`;
const tick = () => new Promise((done) => setTimeout(done, 0));

/** A bridge whose clock is `serverMs()`; the client clock is separate. */
function bridge(serverMs: () => number, mode: { answer?: "off" | "failed"; omit?: Set<string> } = {}) {
  const calls: Array<{ paths: string[]; pageId: string | null }> = [];
  const transport = async (paths: string[], pageId: string | null): Promise<SignAnswer> => {
    calls.push({ paths, pageId });
    if (mode.answer === "off") return { kind: "off" };
    if (mode.answer === "failed") return { kind: "failed" };
    const now = Math.floor(serverMs() / 1000);
    const signed = Object.fromEntries(paths.filter((path) => !mode.omit?.has(path)).map((path) => [path, signedOf(path, expAfter(now))]));
    return { kind: "signed", signed, serverNowSec: now };
  };
  return { calls, transport };
}

function clock(startMs: number) {
  let now = startMs;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
}

test("D233-2: a gallery of 30 foreign pages costs at most 1 + 30 calls, and the second render 0", async () => {
  const server = clock(Date.UTC(2026, 10, 22, 10, 5));
  const { calls, transport } = bridge(server.now);
  const signer = createMediaSigner({ transport, nowMs: server.now, userId: () => ME });
  const cards = Array.from({ length: 30 }, (_, index) => ({ pageId: `page-${index}`, cover: upload(foreigner(index), index), own: upload(ME, 100 + index) }));
  const render = () => Promise.all(cards.flatMap((card) => [signer.sign(card.cover, card.pageId), signer.sign(card.own, card.pageId)]));
  const first = await render();
  assert.ok(first.every((link) => typeof link === "string" && link.includes("sig=")));
  assert.ok(calls.length <= 31, `${calls.length} calls`);
  assert.equal(calls.filter((call) => call.pageId === null).length, 1);
  assert.deepEqual(new Set(calls.filter((call) => call.pageId === null)[0].paths), new Set(cards.map((card) => card.own)));
  const before = calls.length;
  await render();
  assert.equal(calls.length, before);
  assert.ok(cards.every((card) => signer.peek(card.cover, card.pageId).kind === "signed"));
});

test("D233-2: at most 200 paths per call and one call per authority in flight", async () => {
  const server = clock(Date.UTC(2026, 10, 22, 10, 5));
  const { calls, transport } = bridge(server.now);
  let inFlight = 0;
  let peak = 0;
  const slow = async (paths: string[], pageId: string | null) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await tick();
    inFlight -= 1;
    return transport(paths, pageId);
  };
  const signer = createMediaSigner({ transport: slow, nowMs: server.now, userId: () => ME });
  await Promise.all(Array.from({ length: 450 }, (_, index) => signer.sign(upload(ME, index))));
  assert.deepEqual(calls.map((call) => call.paths.length), [200, 200, 50]);
  assert.equal(peak, 1);
});

test("D233-2: a foreign path with no page is never sent", async () => {
  const server = clock(Date.UTC(2026, 10, 22, 10, 5));
  const { calls, transport } = bridge(server.now);
  const signer = createMediaSigner({ transport, nowMs: server.now, userId: () => ME });
  assert.equal(await signer.sign(upload(foreigner(1), 1)), null);
  assert.equal(calls.length, 0);
});

test("D233-3: a 503 turns signing off for 10 min with 0 requests over 100 renders", async () => {
  const server = clock(Date.UTC(2026, 10, 22, 10, 5));
  const { calls, transport } = bridge(server.now, { answer: "off" });
  const signer = createMediaSigner({ transport, nowMs: server.now, userId: () => ME });
  assert.equal(await signer.sign(upload(ME, 1)), null);
  assert.equal(calls.length, 1);
  for (let render = 0; render < 100; render += 1) {
    assert.equal(signer.peek(upload(ME, render), "page").kind, "bare");
    assert.equal(await signer.sign(upload(ME, render), "page"), null);
    server.advance(5_000);
  }
  assert.equal(calls.length, 1);
  server.advance(2 * 60_000);
  await signer.sign(upload(ME, 1));
  assert.equal(calls.length, 2, "asks again once the 10 min are over");
});

test("D233-3: an error or a left-out path renders bare and is asked again after a minute, not before", async () => {
  const server = clock(Date.UTC(2026, 10, 22, 10, 5));
  const omitted = upload(foreigner(2), 2);
  const { calls, transport } = bridge(server.now, { omit: new Set([omitted]) });
  const signer = createMediaSigner({ transport, nowMs: server.now, userId: () => ME });
  assert.equal(await signer.sign(omitted, "page"), null);
  server.advance(30_000);
  assert.equal(signer.peek(omitted, "page").kind, "bare");
  assert.equal(await signer.sign(omitted, "page"), null);
  assert.equal(calls.length, 1);
  server.advance(31_000);
  assert.equal(signer.peek(omitted, "page").kind, "pending");
  await signer.sign(omitted, "page");
  assert.equal(calls.length, 2);
  const failing = bridge(server.now, { answer: "failed" });
  const down = createMediaSigner({ transport: failing.transport, nowMs: server.now, userId: () => ME });
  assert.equal(await down.sign(upload(ME, 3)), null);
  assert.equal(await down.sign(upload(ME, 3)), null);
  assert.equal(failing.calls.length, 1);
});

test("D233-3: a throwing transport renders bare", async () => {
  const signer = createMediaSigner({ transport: async () => { throw new Error("offline"); }, userId: () => ME });
  assert.equal(await signer.sign(upload(ME, 1)), null);
});

for (const skewHours of [-2, 2]) {
  test(`D233-4: a client clock ${skewHours > 0 ? "+" : ""}${skewHours} h off serves no expired link and does not re-sign every render`, async () => {
    const server = clock(Date.UTC(2026, 10, 22, 10, 59, 30));
    const client = { now: () => server.now() + skewHours * HOUR * 1000 };
    const { calls, transport } = bridge(server.now);
    const signer = createMediaSigner({ transport, nowMs: client.now, userId: () => ME });
    const path = upload(ME, 7);
    const link = await signer.sign(path);
    const exp = Number(new URLSearchParams(String(link).split("?")[1]).get("exp"));
    for (let render = 0; render < 100; render += 1) {
      assert.equal(signer.peek(path).kind, "signed");
      assert.ok(server.now() / 1000 < exp - 600, "a cached link is never within 10 min of exp");
      server.advance(30_000);
    }
    assert.equal(calls.length, 1);
    while (signer.peek(path).kind === "signed") {
      assert.ok(server.now() / 1000 < exp - 600);
      server.advance(30_000);
    }
    assert.equal(signer.peek(path).kind, "pending");
  });
}

test("D233-4: with no server clock, a link is kept for the 1 h minimum only", async () => {
  const server = clock(Date.UTC(2026, 10, 22, 10, 0, 1));
  const path = upload(ME, 8);
  const signer = createMediaSigner({
    transport: async (paths) => ({ kind: "signed", signed: { [paths[0]]: signedOf(paths[0], expAfter(Math.floor(server.now() / 1000))) }, serverNowSec: null }),
    nowMs: server.now,
    userId: () => ME,
  });
  await signer.sign(path);
  server.advance(50 * 60_000 - 1_000);
  assert.equal(signer.peek(path).kind, "signed");
  server.advance(2_000);
  assert.equal(signer.peek(path).kind, "pending");
});

test("D233-5: forget drops one cached link so an errored element re-signs once", async () => {
  const server = clock(Date.UTC(2026, 10, 22, 10, 5));
  const { calls, transport } = bridge(server.now);
  const signer = createMediaSigner({ transport, nowMs: server.now, userId: () => ME });
  const path = upload(ME, 9);
  await signer.sign(path);
  signer.forget(path);
  assert.equal(signer.peek(path).kind, "pending");
  assert.ok(String(await signer.sign(path)).includes("sig="));
  assert.equal(calls.length, 2);
});

test("parseSignAnswer: keeps string links, takes now or the Date header, refuses junk", () => {
  const path = upload(ME, 1);
  assert.deepEqual(parseSignAnswer({ signed: { [path]: signedOf(path, 1), x: 3 }, now: 1700000000 }, null),
    { kind: "signed", signed: { [path]: signedOf(path, 1) }, serverNowSec: 1700000000 });
  assert.deepEqual(parseSignAnswer({ signed: {} }, "Wed, 22 Nov 2023 00:00:00 GMT"), { kind: "signed", signed: {}, serverNowSec: 1700611200 });
  assert.deepEqual(parseSignAnswer({ signed: {} }, null), { kind: "signed", signed: {}, serverNowSec: null });
  assert.deepEqual(parseSignAnswer(null, null), { kind: "failed" });
  assert.deepEqual(parseSignAnswer({ signed: [] }, null), { kind: "failed" });
});
