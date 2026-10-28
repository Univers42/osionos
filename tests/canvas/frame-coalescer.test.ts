import assert from "node:assert/strict";
import test from "node:test";

import { coalesceToFrame } from "@/shared/lib/dom/frameCoalescer";

function fakeFrames() {
  const queued = new Map<number, FrameRequestCallback>();
  let next = 1;
  return {
    requestAnimationFrame: (callback: FrameRequestCallback) => { queued.set(next, callback); return next++; },
    cancelAnimationFrame: (id: number) => { queued.delete(id); },
    tick: () => { const callbacks = [...queued.values()]; queued.clear(); for (const callback of callbacks) callback(0); },
    get queued() { return queued.size; },
  };
}

test("coalesceToFrame applies only the latest value, once per frame", () => {
  const frames = fakeFrames();
  const applied: number[] = [];
  const writer = coalesceToFrame((width: number) => applied.push(width), frames);
  writer.push(10);
  writer.push(20);
  writer.push(30);
  assert.equal(frames.queued, 1);
  assert.deepEqual(applied, []);
  frames.tick();
  assert.deepEqual(applied, [30]);
  frames.tick();
  assert.deepEqual(applied, [30], "nothing new pushed, nothing applied");
});

test("coalesceToFrame flush applies the pending value now and cancels the frame", () => {
  const frames = fakeFrames();
  const applied: number[] = [];
  const writer = coalesceToFrame((width: number) => applied.push(width), frames);
  writer.push(42);
  writer.flush();
  assert.deepEqual(applied, [42]);
  assert.equal(frames.queued, 0);
  writer.flush();
  assert.deepEqual(applied, [42], "a second flush has nothing to apply");
});
