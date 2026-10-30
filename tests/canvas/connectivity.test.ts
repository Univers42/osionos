/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   connectivity.test.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// #176: nothing told a user they were offline or that the server stopped answering;
// edits silently waited in the outbox. These are the primitives the notices read.

import assert from "node:assert/strict";
import test from "node:test";

import {
  connectivityAwareFetch, connectivityNotice, connectivityStatus, useConnectivityStore,
} from "../../src/shared/api/connectivity.ts";

const answering = (status: number) => async () => new Response("{}", { status });

async function outcome(inner: () => Promise<Response>): Promise<boolean[]> {
  const reports: boolean[] = [];
  await connectivityAwareFetch(inner, (reachable) => reports.push(reachable))("https://bridge.test/api/x").catch(() => undefined);
  return reports;
}

test("a request the network refused reports the bridge unreachable and still throws", async () => {
  const reports: boolean[] = [];
  const wrapped = connectivityAwareFetch(async () => { throw new TypeError("Failed to fetch"); }, (reachable) => reports.push(reachable));
  await assert.rejects(wrapped("https://bridge.test/api/x"), TypeError);
  assert.deepEqual(reports, [false]);
});

test("a gateway error (502, 504) reports the bridge unreachable", async () => {
  assert.deepEqual(await outcome(answering(502)), [false]);
  assert.deepEqual(await outcome(answering(504)), [false]);
});

test("any answer of the bridge itself, even a refusal, reports it reachable", async () => {
  for (const status of [200, 401, 404, 503]) assert.deepEqual(await outcome(answering(status)), [true], `status ${status}`);
});

test("a request the app cancelled says nothing about the connection", async () => {
  assert.deepEqual(await outcome(async () => { throw new DOMException("aborted", "AbortError"); }), []);
});

const status = () => connectivityStatus(useConnectivityStore.getState());
const reset = () => useConnectivityStore.setState({ browserOnline: true, failures: 0 });

test("one failed request is a blip; two in a row are an unstable connection; an answer clears it", () => {
  reset();
  useConnectivityStore.getState().reportBridge(false);
  assert.equal(status(), "online");
  useConnectivityStore.getState().reportBridge(false);
  assert.equal(status(), "unstable");
  useConnectivityStore.getState().reportBridge(true);
  assert.equal(status(), "online");
});

test("an offline browser is offline whatever the bridge did, and coming back starts clean", () => {
  reset();
  useConnectivityStore.getState().reportBridge(false);
  useConnectivityStore.getState().reportBridge(false);
  useConnectivityStore.getState().setBrowserOnline(false);
  assert.equal(status(), "offline");
  useConnectivityStore.getState().setBrowserOnline(true);
  assert.equal(status(), "online");
});

test("each change of connection has one notice, and staying put has none", () => {
  assert.match(connectivityNotice("online", "offline")?.title ?? "", /offline/);
  assert.equal(connectivityNotice("online", "offline")?.kind, "warning");
  assert.equal(connectivityNotice("unstable", "offline")?.kind, "warning");
  assert.match(connectivityNotice("online", "unstable")?.title ?? "", /unstable/);
  assert.equal(connectivityNotice("offline", "online")?.title, "Back online");
  assert.equal(connectivityNotice("unstable", "online")?.title, "Connection restored");
  assert.equal(connectivityNotice("offline", "online")?.kind, "success");
  for (const same of ["online", "offline", "unstable"] as const) assert.equal(connectivityNotice(same, same), null);
});
