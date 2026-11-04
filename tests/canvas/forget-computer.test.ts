// "Forget this computer" from the app (devil verdict 2026-11-01, Amendment 1, R8): a hidden frame of
// the node's terminal page is told `forget` after its ready, and the answer is `forgotten` or, past
// the bound, "unreachable". The frame is always removed.
import assert from "node:assert/strict";
import test from "node:test";

import { FORGET_TIMEOUT_MS, forgetThisComputer } from "../../src/features/machines/model/forgetComputer.ts";

const NODE = "http://127.0.0.1:4100";

function world() {
  const posted: Array<{ message: unknown; origin: string }> = [];
  let handler: (event: { data: unknown; origin: string; source: unknown }) => void = () => {};
  let fire: () => void = () => {};
  let removed = 0;
  let waitedMs = 0;
  const frameWindow = { postMessage: (message: unknown, origin: string) => posted.push({ message, origin }) };
  const outcome = forgetThisComputer({
    openFrame: () => ({ window: frameWindow, remove: () => { removed += 1; } }),
    listen: (next) => { handler = next; return () => { handler = () => {}; }; },
    schedule: (next, ms) => { fire = next; waitedMs = ms; return () => { fire = () => {}; }; },
  });
  const deliver = (data: unknown, origin = NODE, source: unknown = frameWindow) => handler({ data, origin, source });
  return { posted, outcome, deliver, timeout: () => fire(), removed: () => removed, waitedMs: () => waitedMs };
}

test("R8: after the hidden page's ready it is told forget, once, and its forgotten ends it", async () => {
  const w = world();
  w.deliver({ type: "osionos-ide/ready", node: "m-abcdefghijklmnop" }, "https://evil.example");
  w.deliver({ type: "osionos-ide/ready", node: "m-abcdefghijklmnop" }, NODE, {});
  assert.deepEqual(w.posted, [], "another origin or window is not the page");
  w.deliver({ type: "osionos-ide/ready", node: "m-abcdefghijklmnop" });
  w.deliver({ type: "osionos-ide/ready", node: "m-abcdefghijklmnop" });
  assert.deepEqual(w.posted, [{ message: { type: "osionos-ide/forget" }, origin: NODE }]);
  w.deliver({ type: "osionos-ide/forgotten" });
  assert.equal(await w.outcome, "forgotten");
  assert.equal(w.removed(), 1);
});

test("R8: a node that never answers is unreachable after the bound, and the frame still goes", async () => {
  const w = world();
  assert.equal(w.waitedMs(), FORGET_TIMEOUT_MS);
  w.timeout();
  assert.equal(await w.outcome, "unreachable");
  assert.equal(w.removed(), 1);
});
