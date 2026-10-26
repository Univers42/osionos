/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   session-wait.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The object-database pull waits for the session token. The app pokes the wait the
// moment a sign-in lands (App.tsx, on activeUserId); the wait used to ignore that poke
// and start on its next 1.5 s tick, so the first load after sign-in sat idle for up to
// 1.5 s before its download began.

import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

import { createSessionWait } from "../../src/widgets/database-view/model/sessionWait";

const RETRY_MS = 1500;
let session = false;
let start: ReturnType<typeof mock.fn>;

function makeWait(maxAttempts = 12) {
  return createSessionWait({ hasSession: () => session, start, retryMs: RETRY_MS, maxAttempts });
}

/** One tick per interval: the mock clock runs only the timers due when a tick begins. */
function tickRetries(count: number) {
  for (let index = 0; index < count; index += 1) mock.timers.tick(RETRY_MS);
}

beforeEach(() => {
  mock.timers.enable({ apis: ["setTimeout"] });
  session = false;
  start = mock.fn();
});
afterEach(() => mock.timers.reset());

test("starts at once when the session is already there", () => {
  session = true;
  makeWait().poke();
  assert.equal(start.mock.callCount(), 1);
});

test("without a poke, a late session is picked up on the next tick", () => {
  const wait = makeWait();
  wait.poke();
  session = true;
  mock.timers.tick(RETRY_MS - 1);
  assert.equal(start.mock.callCount(), 0);
  mock.timers.tick(1);
  assert.equal(start.mock.callCount(), 1);
});

test("a poke after the session lands starts now, and the pending tick does not start again", () => {
  const wait = makeWait();
  wait.poke();
  session = true;
  wait.poke();
  assert.equal(start.mock.callCount(), 1, "started on the poke, not 1.5 s later");
  tickRetries(3);
  assert.equal(start.mock.callCount(), 1);
});

test("pokes without a session do not use up the attempts", () => {
  const wait = makeWait(3);
  for (let index = 0; index < 20; index += 1) wait.poke();
  mock.timers.tick(RETRY_MS);
  session = true;
  mock.timers.tick(RETRY_MS);
  assert.equal(start.mock.callCount(), 1);
});

test("gives up after the last attempt, and a later poke starts over", () => {
  const wait = makeWait(3);
  wait.poke();
  tickRetries(10);
  session = true;
  tickRetries(10);
  assert.equal(start.mock.callCount(), 0, "no tick is left after giving up");
  wait.poke();
  assert.equal(start.mock.callCount(), 1);
});

test("cancel drops the pending tick (account switch)", () => {
  const wait = makeWait();
  wait.poke();
  wait.cancel();
  session = true;
  tickRetries(3);
  assert.equal(start.mock.callCount(), 0);
});
