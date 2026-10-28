import assert from "node:assert/strict";
import test from "node:test";

import { BOARD_CREATED, TOKEN_REQUEST, createTokenSource, originOf, readHydrawnMessage } from "../../src/features/whiteboard/model/hydrawnHost.ts";

const ORIGIN = "https://whiteboard.example";
const frame = { name: "hydrawn frame" };
const event = (data: unknown, origin = ORIGIN, source: unknown = frame) => ({ data, origin, source }) as unknown as MessageEvent;

test("originOf keeps only absolute origins", () => {
  assert.equal(originOf("https://whiteboard.example/boards/abc"), ORIGIN);
  assert.equal(originOf("/hydrawn/"), "");
  assert.equal(originOf(""), "");
  assert.equal(originOf("data:text/html,x"), "");
});

test("a token request counts only from the frame, at the whiteboard origin, in its exact shape", () => {
  assert.deepEqual(readHydrawnMessage(event({ type: TOKEN_REQUEST }), frame, ORIGIN), { kind: "token-request" });
  assert.equal(readHydrawnMessage(event({ type: TOKEN_REQUEST }, "https://evil.example"), frame, ORIGIN), null);
  assert.equal(readHydrawnMessage(event({ type: TOKEN_REQUEST }, ORIGIN, { other: true }), frame, ORIGIN), null);
  assert.equal(readHydrawnMessage(event({ type: TOKEN_REQUEST, extra: 1 }), frame, ORIGIN), null);
  assert.equal(readHydrawnMessage(event(TOKEN_REQUEST), frame, ORIGIN), null);
  assert.equal(readHydrawnMessage(event({ type: TOKEN_REQUEST }), frame, ""), null);
  assert.equal(readHydrawnMessage(event({ type: TOKEN_REQUEST }, ORIGIN, null), null, ORIGIN), null);
});

test("a created board counts only with a valid slug", () => {
  assert.deepEqual(readHydrawnMessage(event({ type: BOARD_CREATED, slug: "abcd1234efgh" }), frame, ORIGIN), { kind: "board-created", slug: "abcd1234efgh" });
  assert.equal(readHydrawnMessage(event({ type: BOARD_CREATED, slug: "../x" }), frame, ORIGIN), null);
  assert.equal(readHydrawnMessage(event({ type: BOARD_CREATED }), frame, ORIGIN), null);
});

test("the token source reuses a fresh token, re-mints near expiry, and never crosses sessions", async () => {
  let clock = 1_800_000_000_000;
  let session: string | null = "session-a";
  const mints: string[] = [];
  const source = createTokenSource({
    getSession: () => session,
    now: () => clock,
    mint: async (from) => {
      mints.push(from);
      return { token: `token-for-${from}-${mints.length}`, exp: Math.floor(clock / 1000) + 300 };
    },
  });
  const [first, concurrent] = await Promise.all([source(), source()]);
  assert.equal(first?.token, "token-for-session-a-1");
  assert.equal(concurrent?.token, first?.token);
  assert.equal((await source())?.token, first?.token);
  clock += 250_000;
  assert.equal((await source())?.token, "token-for-session-a-2");
  session = "session-b";
  assert.equal((await source())?.token, "token-for-session-b-3");
  session = null;
  assert.equal(await source(), null);
  assert.deepEqual(mints, ["session-a", "session-a", "session-b"]);
});

test("a failed mint answers null and the next ask tries again", async () => {
  let calls = 0;
  const source = createTokenSource({
    getSession: () => "s",
    mint: async () => {
      calls += 1;
      if (calls === 1) throw new Error("bridge down");
      return { token: "t", exp: Math.floor(Date.now() / 1000) + 300 };
    },
  });
  assert.equal(await source(), null);
  assert.equal((await source())?.token, "t");
});
