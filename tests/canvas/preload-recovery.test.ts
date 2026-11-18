/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   preload-recovery.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/18 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/18 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// R-BR5 (ADR 0061): the stale-chunk reload (src/app/preloadRecovery.ts) fires once per 10 s for a
// failed lazy import; stands down while the document is leaving, for at most 10 s, then recovers what
// it skipped if the page is still alive; and never reloads without a guard that reads back.

import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { installPreloadRecovery, type RecoveryStorage } from "../../src/app/preloadRecovery.ts";

const WINDOW_MS = 10_000;

function memoryStorage(): RecoveryStorage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
}

function harness(storage: RecoveryStorage | null = memoryStorage()) {
  const target = new EventTarget();
  let clock = 1_000_000;
  let reloads = 0;
  mock.timers.enable({ apis: ["setTimeout"] });
  installPreloadRecovery(target, { storage: storage ?? undefined, now: () => clock, reload: () => void (reloads += 1) });
  return {
    fail: () => target.dispatchEvent(new Event("vite:preloadError")),
    leave: () => target.dispatchEvent(new Event("beforeunload")),
    restore: () => target.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })),
    advance: (ms: number) => {
      clock += ms;
      mock.timers.tick(ms);
    },
    reloads: () => reloads,
  };
}

test.afterEach(() => mock.timers.reset());

test("a failed lazy import reloads once", () => {
  const page = harness();
  page.fail();
  assert.equal(page.reloads(), 1);
});

test("a failure after the document started navigating away does not reload at once", () => {
  const page = harness();
  page.leave();
  page.fail();
  assert.equal(page.reloads(), 0);
});

test("a failure swallowed while leaving reloads once when the mark clears, not before", () => {
  const page = harness();
  page.leave();
  page.fail();
  page.advance(WINDOW_MS - 1);
  assert.equal(page.reloads(), 0);
  page.advance(1);
  assert.equal(page.reloads(), 1);
});

test("leaving with no failure swallowed never reloads", () => {
  const page = harness();
  page.leave();
  page.advance(WINDOW_MS * 2);
  assert.equal(page.reloads(), 0);
});

test("a failure after the mark cleared reloads at once", () => {
  const page = harness();
  page.leave();
  page.advance(WINDOW_MS);
  page.fail();
  assert.equal(page.reloads(), 1);
});

test("a bfcache restore clears the mark and recovers a swallowed failure once", () => {
  const page = harness();
  page.leave();
  page.fail();
  page.restore();
  assert.equal(page.reloads(), 1);
  page.advance(WINDOW_MS * 2);
  assert.equal(page.reloads(), 1);
});

test("a burst of failures inside the guard window reloads once", () => {
  const page = harness();
  page.fail();
  page.advance(WINDOW_MS - 1);
  page.fail();
  assert.equal(page.reloads(), 1);
});

test("a failure after the guard window may reload again", () => {
  const page = harness();
  page.fail();
  page.advance(WINDOW_MS + 1);
  page.fail();
  assert.equal(page.reloads(), 2);
});

test("without storage nothing reloads, across two simulated documents", () => {
  for (let load = 0; load < 2; load += 1) {
    const page = harness(null);
    page.fail();
    assert.equal(page.reloads(), 0);
    mock.timers.reset();
  }
});

test("storage that throws never reloads and never throws", () => {
  const broken = () => {
    throw new Error("SecurityError");
  };
  for (const storage of [{ getItem: broken, setItem: () => undefined }, { getItem: () => null, setItem: broken }]) {
    const page = harness(storage);
    assert.doesNotThrow(() => page.fail());
    assert.equal(page.reloads(), 0);
    mock.timers.reset();
  }
});

test("a guard write that does not read back never reloads", () => {
  const page = harness({ getItem: () => null, setItem: () => undefined });
  page.fail();
  assert.equal(page.reloads(), 0);
});
