import assert from 'node:assert/strict';
import test from 'node:test';

import { createInflightDedupe, createRequestGate } from '../src/gate.ts';

/** A promise plus the handles to settle it from the outside. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('gate rejects a non-positive concurrency limit', () => {
  assert.throws(() => createRequestGate(0), RangeError);
  assert.throws(() => createRequestGate(-1), RangeError);
  assert.throws(() => createRequestGate(1.5), RangeError);
});

test('gate runs up to the limit at once and queues the rest', async () => {
  const gate = createRequestGate(2);
  const blockers = [deferred(), deferred(), deferred()];
  let started = 0;

  const runs = blockers.map((blocker) =>
    gate.run(async () => {
      started += 1;
      await blocker.promise;
    }),
  );

  await Promise.resolve();
  assert.equal(started, 2, 'only two tasks may start under a limit of 2');
  assert.equal(gate.active, 2);
  assert.equal(gate.waiting, 1);

  blockers[0].resolve();
  await runs[0];
  assert.equal(started, 3, 'finishing one task admits the queued one');

  blockers[1].resolve();
  blockers[2].resolve();
  await Promise.all(runs);
  assert.equal(gate.active, 0, 'every slot is returned once the queue drains');
  assert.equal(gate.waiting, 0);
});

test('gate releases the slot when a task throws', async () => {
  const gate = createRequestGate(1);
  await assert.rejects(
    gate.run(async () => {
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.equal(gate.active, 0, 'a thrown task must not leak its slot');

  // The gate is still usable — a leaked slot would deadlock this call.
  assert.equal(await gate.run(async () => 'ok'), 'ok');
});

test('gate preserves FIFO order for queued tasks', async () => {
  const gate = createRequestGate(1);
  const order: number[] = [];
  const first = deferred();

  const runs = [
    gate.run(async () => {
      order.push(0);
      await first.promise;
    }),
    gate.run(async () => {
      order.push(1);
    }),
    gate.run(async () => {
      order.push(2);
    }),
  ];

  first.resolve();
  await Promise.all(runs);
  assert.deepEqual(order, [0, 1, 2]);
});

test('dedupe shares one in-flight promise per key', async () => {
  const dedupe = createInflightDedupe();
  const blocker = deferred<string>();
  let starts = 0;

  const start = () => {
    starts += 1;
    return blocker.promise;
  };

  const a = dedupe.share('k', start);
  const b = dedupe.share('k', start);
  assert.equal(starts, 1, 'the second caller must not start a second task');
  assert.equal(dedupe.size, 1);

  blocker.resolve('value');
  assert.deepEqual(await Promise.all([a, b]), ['value', 'value']);
  assert.equal(dedupe.size, 0, 'the entry is dropped once settled');
});

test('dedupe keeps distinct keys independent', async () => {
  const dedupe = createInflightDedupe();
  let starts = 0;
  const start = async () => {
    starts += 1;
    return starts;
  };

  const [a, b] = await Promise.all([dedupe.share('a', start), dedupe.share('b', start)]);
  assert.equal(starts, 2);
  assert.notEqual(a, b);
});

test('dedupe does not cache a rejection', async () => {
  const dedupe = createInflightDedupe();
  let starts = 0;

  const failing = () => {
    starts += 1;
    return Promise.reject(new Error('nope'));
  };

  await assert.rejects(dedupe.share('k', failing), /nope/);
  assert.equal(dedupe.size, 0);

  // A retry must actually re-run: a cached rejection would poison the key.
  await assert.rejects(dedupe.share('k', failing), /nope/);
  assert.equal(starts, 2);
});
