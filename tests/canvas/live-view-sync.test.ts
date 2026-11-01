// A live mount's views follow the account across browsers (#252).

import assert from "node:assert/strict";
import test from "node:test";

import { LIVE_VIEWS_KEY_PREFIX, liveViewsKey, pushLiveViews } from "../../src/shared/notion-database-sys/src/store/live/liveViewSync.ts";

test("views get their own key, and a key the bridge would truncate stays local", () => {
  assert.equal(liveViewsKey("baas:db:orders"), `${LIVE_VIEWS_KEY_PREFIX}baas:db:orders`);
  assert.equal(liveViewsKey(`baas:db:${"t".repeat(200)}`), null);
});

test("rapid edits push once, the last state", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const bodies: { dbKey: string; state: { views: Record<string, unknown> } }[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return new Response("{}");
  });
  pushLiveViews("baas:db:orders", { a: {} } as never);
  pushLiveViews("baas:db:orders", { b: {} } as never);
  t.mock.timers.tick(1000);
  await Promise.resolve();
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].dbKey, "liveviews:baas:db:orders");
  assert.deepEqual(Object.keys(bodies[0].state.views), ["b"]);
});
