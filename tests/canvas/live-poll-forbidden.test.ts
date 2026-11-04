/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-poll-forbidden.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* A 403 (no workspace access) / 401 must STOP the live poll, not retry-storm it
 * — the regression behind a no-access tab hammering the bridge every 15s. */

import assert from "node:assert/strict";
import test from "node:test";

import { LivePoll, isPermanentDenial, isRequestRejected } from "../../src/shared/notion-database-sys/src/store/live/livePoll.ts";

test("isPermanentDenial flags 403/401 by status or message; transient otherwise", () => {
  assert.ok(isPermanentDenial({ status: 403 }));
  assert.ok(isPermanentDenial({ status: 401 }));
  assert.ok(isPermanentDenial({ message: "Database is not linked to an accessible workspace." }));
  assert.ok(isPermanentDenial({ message: "Live BaaS request failed: HTTP 403" }));
  assert.ok(!isPermanentDenial({ status: 500 }));
  // 503/network (FETCH_FAILED) is TRANSIENT — a bridge blip must not latch the
  // adapter's forbidden state and poison the mount for the SPA lifetime.
  assert.ok(!isPermanentDenial({ status: 503 }));
  assert.ok(!isPermanentDenial({ message: "network blip" }));
  assert.ok(!isPermanentDenial(null));
});

test("the poll stops its interval on a permanent denial and signals once", async () => {
  let calls = 0;
  let permanent = 0;
  const poll = new LivePoll({
    fetchRows: async () => {
      calls += 1;
      throw Object.assign(new Error("forbidden"), { status: 403 });
    },
    pendingWrites: () => 0,
    onChanged: () => {},
    onPermanentError: () => { permanent += 1; },
    intervalMs: 5,
  });
  poll.noteBaseline([], ["id"]);
  poll.start();
  await new Promise((resolve) => setTimeout(resolve, 50)); // ~10 ticks would fire without the stop
  poll.stop();
  assert.equal(permanent, 1, "onPermanentError fired exactly once");
  assert.ok(calls <= 2, `interval stopped after the 403 (calls=${calls})`);
});

test("isRequestRejected: a 4xx other than 401/403/408/429 is the request itself, not a blip", () => {
  for (const status of [400, 404, 422]) assert.ok(isRequestRejected({ status }), `status ${status}`);
  for (const status of [401, 403, 408, 429, 500, 502, 503]) assert.ok(!isRequestRejected({ status }), `status ${status}`);
  assert.ok(!isRequestRejected({ message: "network blip" }));
  assert.ok(!isRequestRejected(null));
});

test("the poll stops on a rejected request without signalling a denial", async () => {
  // Production 2026-11-04: database "Dish" names a table its sqlite file lacks; the poll
  // re-listed it every 15 s and each answer was a console error.
  let calls = 0;
  let permanent = 0;
  const poll = new LivePoll({
    fetchRows: async () => {
      calls += 1;
      throw Object.assign(new Error("sqlite: no such table: dish"), { status: 400 });
    },
    pendingWrites: () => 0,
    onChanged: () => {},
    onPermanentError: () => { permanent += 1; },
    intervalMs: 5,
  });
  poll.noteBaseline([], ["id"]);
  poll.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  poll.stop();
  assert.equal(permanent, 0, "a missing table is not an access denial");
  assert.ok(calls <= 2, `interval stopped after the 400 (calls=${calls})`);
});
