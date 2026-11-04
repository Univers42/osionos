// #293: the app learned that an optional feature was off from that feature's own 404 (Home's
// "For you" strip, Settings > Published pages), and Chrome logs every 404 as a console error.
// It now asks the bridge once (GET /api/capabilities, a 200) and skips a route the bridge does
// not serve.

import assert from "node:assert/strict";
import test from "node:test";

import { createCapabilityReader, parseCapabilities } from "../../src/shared/api/bridgeCapabilities.ts";

test("only a boolean the bridge sent counts; anything else is unknown", () => {
  assert.deepEqual(parseCapabilities({ capabilities: { recs: true, publish: false } }), { recs: true, publish: false });
  assert.deepEqual(parseCapabilities({ capabilities: { recs: "1", publish: null } }), {});
  assert.deepEqual(parseCapabilities({}), {});
  assert.deepEqual(parseCapabilities(null), {});
});

test("one read per session token, shared by every caller", async () => {
  const reads: string[] = [];
  let token = "tok-a";
  const reader = createCapabilityReader({
    token: () => token,
    load: async (bearer) => { reads.push(bearer); return { capabilities: { recs: false, publish: true } }; },
  });
  assert.deepEqual(await Promise.all([reader.serves("recs"), reader.serves("publish"), reader.serves("recs")]), [false, true, false]);
  assert.deepEqual(reads, ["tok-a"]);
  token = "tok-b";
  await reader.serves("recs");
  assert.deepEqual(reads, ["tok-a", "tok-b"], "a new session asks again");
});

test("no session, a failed read or a missing field is null: the caller asks its route as before", async () => {
  const signedOut = createCapabilityReader({ token: () => null, load: async () => { throw new Error("must not load"); } });
  assert.equal(await signedOut.serves("recs"), null);
  const failing = createCapabilityReader({ token: () => "t", load: async () => { throw new Error("404"); } });
  assert.equal(await failing.serves("publish"), null);
  const partial = createCapabilityReader({ token: () => "t", load: async () => ({ capabilities: { recs: true } }) });
  assert.equal(await partial.serves("publish"), null);
});
