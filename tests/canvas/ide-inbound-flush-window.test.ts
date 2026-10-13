/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ide-inbound-flush-window.test.ts                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The drain's flush window on a manual clock (C3b5 P1): quiet restarts with each
// create, the deadline does not, `due` fires once per window, stop disarms both.

import assert from "node:assert/strict";
import test from "node:test";

import { createFlushWindow, FLUSH_MAX_MS, FLUSH_QUIET_MS } from "../../src/features/ide/model/inboundFlushWindow.ts";
import { createFakeClock } from "./fixtures/fakeClock.ts";

function windowOnClock() {
  const clock = createFakeClock();
  const fired = { count: 0 };
  const flushWindow = createFlushWindow({ schedule: clock.schedule, due: () => { fired.count += 1; } });
  return { clock, fired, flushWindow };
}

test("flush window: due once, FLUSH_QUIET_MS after the last touch, and both timers disarmed", () => {
  const { clock, fired, flushWindow } = windowOnClock();
  flushWindow.touch();
  clock.advance(FLUSH_QUIET_MS - 1);
  flushWindow.touch();
  clock.advance(FLUSH_QUIET_MS - 1);
  assert.equal(fired.count, 0, "each touch restarts the quiet timer");
  clock.advance(1);
  assert.equal(fired.count, 1);
  assert.equal(clock.pendingCount(), 0, "the deadline went with it");
  clock.advance(FLUSH_MAX_MS);
  assert.equal(fired.count, 1);
});

test("flush window: touches closer than the quiet window end at the deadline, counted from the first", () => {
  const { clock, fired, flushWindow } = windowOnClock();
  let elapsed = 0;
  while (elapsed < FLUSH_MAX_MS) {
    flushWindow.touch();
    clock.advance(1);
    elapsed += 1;
    assert.equal(fired.count, elapsed < FLUSH_MAX_MS ? 0 : 1, `at ${elapsed} ms`);
  }
  assert.equal(clock.pendingCount(), 0);
  flushWindow.touch();
  assert.equal(clock.pendingCount(), 2, "the next touch opens a new window with its own deadline");
});

test("flush window: stop disarms both timers and nothing fires", () => {
  const { clock, fired, flushWindow } = windowOnClock();
  flushWindow.touch();
  flushWindow.stop();
  assert.equal(clock.pendingCount(), 0);
  clock.advance(FLUSH_MAX_MS);
  assert.equal(fired.count, 0);
});
