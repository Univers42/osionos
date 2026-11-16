/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   network-retry.test.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/16 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/16 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// When the browser drops an HTTP/2 session (a stalled network path), every request in flight on it
// fails at once with a network TypeError: the console fills with "CORS request did not succeed" and
// the connectivity notice flips to unstable and back within seconds. A read is safe to send again.

import assert from "node:assert/strict";
import test from "node:test";

import { connectivityAwareFetch } from "../../src/shared/api/connectivity.ts";
import { networkRetryFetch } from "../../src/shared/api/networkRetry.ts";

const dropped = () => new TypeError("NetworkError when attempting to fetch resource.");
const noWait = async () => undefined;

/** A fetch that throws `drops` network errors, then answers 200; `calls` counts attempts. */
function flaky(drops: number) {
  const state = { calls: 0 };
  const impl = async () => {
    state.calls += 1;
    if (state.calls <= drops) throw dropped();
    return new Response("{}", { status: 200 });
  };
  return { state, impl };
}

test("a read dropped by the network is sent again and answers", async () => {
  const { state, impl } = flaky(1);
  const response = await networkRetryFetch(impl, [5, 5], noWait)("https://bridge.test/api/x");
  assert.equal(response.status, 200);
  assert.equal(state.calls, 2);
});

test("a read that keeps failing gives up after the last delay with the network error", async () => {
  const { state, impl } = flaky(10);
  await assert.rejects(networkRetryFetch(impl, [5, 5], noWait)("https://bridge.test/api/x", { method: "GET" }), TypeError);
  assert.equal(state.calls, 3);
});

test("a write is never sent twice: it may have reached the server", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const { state, impl } = flaky(1);
    await assert.rejects(networkRetryFetch(impl, [5], noWait)("https://bridge.test/api/x", { method }), TypeError);
    assert.equal(state.calls, 1, method);
  }
});

test("an answer, even a gateway error, is not a dropped request", async () => {
  let calls = 0;
  const impl = async () => { calls += 1; return new Response("{}", { status: 502 }); };
  assert.equal((await networkRetryFetch(impl, [5], noWait)("https://bridge.test/api/x")).status, 502);
  assert.equal(calls, 1);
});

test("a request the app cancelled is not sent again", async () => {
  let calls = 0;
  const impl = async () => { calls += 1; throw new DOMException("aborted", "AbortError"); };
  await assert.rejects(networkRetryFetch(impl, [5], noWait)("https://bridge.test/api/x"), { name: "AbortError" });
  assert.equal(calls, 1);
  const controller = new AbortController();
  const { state, impl: drop } = flaky(1);
  const cancelDuringWait = async () => { controller.abort(); };
  await assert.rejects(networkRetryFetch(drop, [5], cancelDuringWait)("https://bridge.test/api/x", { signal: controller.signal }), TypeError);
  assert.equal(state.calls, 1);
});

test("a read that answers on its second try leaves the connection reported reachable", async () => {
  const reports: boolean[] = [];
  const { impl } = flaky(1);
  await connectivityAwareFetch(networkRetryFetch(impl, [5], noWait), (reachable) => reports.push(reachable))("https://bridge.test/api/x");
  assert.deepEqual(reports, [true]);
});
