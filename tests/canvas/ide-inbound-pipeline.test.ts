/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-pipeline.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";

import {
  createSerialQueue,
  decodeUtf8Strict,
  acquireInboundLeadership,
} from "../../src/features/ide/model/inboundPipeline.ts";
import { createFakeLocks } from "./fixtures/fakeLocks.ts";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** base64 of the UTF-8 bytes of `text` — btoa alone would encode Latin-1
 *  bytes, which is not what the fs-agent emits for non-ASCII text. */
const utf8B64 = (text: string): string =>
  btoa(Array.from(new TextEncoder().encode(text), (b) => String.fromCharCode(b)).join(""));

test("queue: three tasks with different delays finish in FIFO order and never overlap", async () => {
  const order: string[] = [];
  let active = 0;
  let maxActive = 0;
  const task = (name: string, delayMs: number) => async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    active--;
    order.push(name);
  };
  const queue = createSerialQueue(() => {});
  await Promise.all([
    queue.run(task("first", 30)),
    queue.run(task("second", 10)),
    queue.run(task("third", 0)),
  ]);
  assert.deepEqual(order, ["first", "second", "third"]);
  assert.equal(maxActive, 1);
});

test("queue: a throwing task is reported once and the next task still runs", async () => {
  const errors: unknown[] = [];
  const queue = createSerialQueue((error) => errors.push(error));
  const order: string[] = [];
  await queue.run(async () => {
    order.push("a");
    throw new Error("boom");
  });
  await queue.run(async () => {
    order.push("b");
  });
  assert.equal(errors.length, 1);
  assert.ok(errors[0] instanceof Error);
  assert.equal((errors[0] as Error).message, "boom");
  assert.deepEqual(order, ["a", "b"]);
});

test("queue: a rejecting task is reported once and the next task still runs", async () => {
  const errors: unknown[] = [];
  const queue = createSerialQueue((error) => errors.push(error));
  await queue.run(() => Promise.reject(new Error("nope")));
  let ran = false;
  await queue.run(async () => {
    ran = true;
  });
  assert.equal(errors.length, 1);
  assert.equal((errors[0] as Error).message, "nope");
  assert.equal(ran, true);
});

test("queue: run never rejects, even when its task does", async () => {
  const queue = createSerialQueue(() => {});
  await queue.run(() => Promise.reject(new Error("must not escape")));
});

test("queue: idle resolves only after everything queued so far settled", async () => {
  const queue = createSerialQueue(() => {});
  let done = false;
  void queue.run(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    done = true;
  });
  let idleResolved = false;
  void queue.idle().then(() => {
    idleResolved = true;
  });
  await Promise.resolve();
  assert.equal(done, false);
  assert.equal(idleResolved, false);
  await queue.idle();
  assert.equal(done, true);
  assert.equal(idleResolved, true);
});

test("queue: idle also waits for a task queued by a running task (a drain's flush)", async () => {
  const queue = createSerialQueue(() => {});
  let flushed = false;
  void queue.run(async () => {
    void queue.run(async () => {
      flushed = true;
    });
  });
  await queue.idle();
  assert.equal(flushed, true);
});

test("decode: ASCII, multi-byte UTF-8 and empty content", () => {
  assert.equal(decodeUtf8Strict(utf8B64("hello world")), "hello world");
  assert.equal(decodeUtf8Strict(utf8B64("é")), "é");
  assert.equal(decodeUtf8Strict(utf8B64("日本")), "日本");
  assert.equal(decodeUtf8Strict(""), "");
});

test("decode: invalid base64 or invalid UTF-8 → null", () => {
  assert.equal(decodeUtf8Strict("not base64!!"), null);
  assert.equal(decodeUtf8Strict("/w=="), null); // valid base64, 0xFF is not UTF-8
});

test("leadership: first tab leads, second waits, under the workspace lock name", async () => {
  const { locks, names } = createFakeLocks();
  const first = acquireInboundLeadership("ws", locks);
  const second = acquireInboundLeadership("ws", locks);
  await flush();
  assert.equal(names[0], "osio-inbound:ws");
  assert.equal(first.isLeader(), true);
  assert.equal(second.isLeader(), false);
  first.release();
  second.release();
});

test("leadership: releasing hands the lock to the next waiting tab", async () => {
  const { locks } = createFakeLocks();
  const first = acquireInboundLeadership("ws", locks);
  const second = acquireInboundLeadership("ws", locks);
  await flush();
  assert.equal(second.isLeader(), false);
  first.release();
  await flush();
  assert.equal(first.isLeader(), false);
  assert.equal(second.isLeader(), true);
  second.release();
});

test("leadership: release before the grant never makes this tab leader", async () => {
  const { locks } = createFakeLocks();
  const tab = acquireInboundLeadership("ws", locks);
  tab.release(); // synchronous — the grant is still a pending microtask
  await flush();
  assert.equal(tab.isLeader(), false);
});

test("leadership: without a LockManager this tab leads at once", () => {
  const solo = acquireInboundLeadership("ws", undefined);
  assert.equal(solo.isLeader(), true);
  solo.release();
  assert.equal(solo.isLeader(), false);
});

test("leadership: a refused lock request leads instead of applying nothing", async () => {
  const refusing = { request: () => Promise.reject(new Error("SecurityError")) };
  const tab = acquireInboundLeadership("ws", refusing);
  await flush();
  assert.equal(tab.isLeader(), true);
  tab.release();
  assert.equal(tab.isLeader(), false);
});
