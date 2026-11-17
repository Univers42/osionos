/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   user-store-sign-out-refresh-token.test.ts          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0056 S1–S3: a sign-out on this device leaves no refresh token of that account in
// localStorage, not in the session record and not in the refresh coordination keys either.

import assert from "node:assert/strict";
import test from "node:test";
import { BRIDGE_KEY, gate, leaseKey, persisted, reset, resultKey, signIn, storage, stubBridge, userStore, useToastStore } from "./user-store-fixtures.ts";

const { useUserStore, dropLocalSession } = userStore;
const RT_U1 = "osb_rt.u1-first.sig";
const RT_U1_ROTATED = "osb_rt.u1-rotated.sig";
const RT_U2 = "osb_rt.u2-first.sig";
const cutoffsUnavailable = () => new Response(JSON.stringify({ ok: false, code: "session_cutoffs_unavailable" }), { status: 503 });

/** Every stored key whose value holds one of the given tokens. */
function keysHolding(...tokens: string[]): string[] {
  return [...storage.data].filter(([, value]) => tokens.some((rt) => value.includes(rt))).map(([key]) => key);
}

async function untilCalled(calls: string[]): Promise<void> {
  while (calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
}

test("S1 a local sign-out removes the account's refresh result and lease, and keeps the other account's", async () => {
  reset();
  signIn("u1", RT_U1);
  signIn("u2", RT_U2);
  stubBridge({ refreshTo: RT_U1_ROTATED });
  assert.equal(await useUserStore.getState().refreshAccount("u1"), "refreshed");
  assert.ok(storage.getItem(resultKey("u1")), "the rotation published its result");
  // A lease a crashed tab never released.
  storage.setItem(leaseKey("u1"), JSON.stringify({ owner: "crashed", until: Date.now() + 60_000 }));
  storage.setItem(leaseKey("u2"), JSON.stringify({ owner: "crashed", until: Date.now() + 60_000 }));
  storage.setItem(resultKey("u2"), JSON.stringify({ prev: "x", accessToken: "a", refreshToken: RT_U2 }));
  dropLocalSession("u1");
  assert.equal(storage.getItem(resultKey("u1")), null);
  assert.equal(storage.getItem(leaseKey("u1")), null);
  assert.ok(storage.getItem(resultKey("u2")), "the other account's result stays");
  assert.ok(storage.getItem(leaseKey("u2")), "the other account's lease stays");
});

test("S2 after a this-device-only sign-out no key in localStorage holds the account's refresh token", async () => {
  reset();
  signIn("u1", RT_U1);
  signIn("u2", RT_U2);
  stubBridge({ refreshTo: RT_U1_ROTATED, logout: cutoffsUnavailable });
  assert.equal(await useUserStore.getState().refreshAccount("u1"), "refreshed");
  assert.deepEqual((await useUserStore.getState().logoutUser("u1")).kind, "cutoffs_unavailable");
  assert.ok(useToastStore.getState().toasts.some((toast) => /this device only/.test(toast.description ?? "")));
  assert.deepEqual(keysHolding(RT_U1, RT_U1_ROTATED), []);
  assert.equal(persisted().u2.session.refreshToken, RT_U2, "the other account keeps its token");
});

test("S3 a rotation that resolves after the sign-out publishes no result for the gone record", async () => {
  reset();
  signIn("u1", RT_U1);
  const answer = gate();
  const calls = stubBridge({ refreshTo: RT_U1_ROTATED, held: answer.opened, logout: cutoffsUnavailable });
  const flight = useUserStore.getState().refreshAccount("u1");
  await untilCalled(calls);
  await useUserStore.getState().logoutUser("u1");
  answer.open();
  await flight;
  assert.equal(storage.getItem(resultKey("u1")), null, "no result for a record that is gone");
  assert.equal(persisted().u1, undefined);
  assert.equal(useUserStore.getState().sessions.u1, undefined);
  assert.deepEqual(keysHolding(RT_U1, RT_U1_ROTATED), []);
});

const storageFull = () => useToastStore.getState().toasts.filter((toast) => toast.title === "Browser storage is full");

test("LV1 a sign-out whose record rewrite is refused leaves no key holding the account's refresh token", () => {
  reset();
  signIn("u1", RT_U1);
  signIn("u2", RT_U2);
  storage.refused.add(BRIDGE_KEY);
  dropLocalSession("u1");
  assert.deepEqual(keysHolding(RT_U1), []);
  assert.equal(useUserStore.getState().sessions.u1, undefined);
  // u2 is still signed in here but no longer saved, so the notice that says so is true.
  assert.equal(persisted().u2, undefined);
  assert.ok(useUserStore.getState().sessions.u2);
  assert.equal(storageFull().length, 1);
});

test("LV1 the last account signing out with its rewrite refused gets no storage-full notice", () => {
  reset();
  signIn("u1", RT_U1);
  storage.refused.add(BRIDGE_KEY);
  dropLocalSession("u1");
  assert.deepEqual(keysHolding(RT_U1), []);
  assert.deepEqual(storageFull(), []);
});

test("LV1 the other accounts stay saved when the map fits once the old one is removed", () => {
  reset();
  signIn("u1", RT_U1);
  signIn("u2", RT_U2);
  storage.refusals.set(BRIDGE_KEY, 2); // the rewrite and the room-maker's retry after evicting
  dropLocalSession("u1");
  assert.deepEqual(keysHolding(RT_U1), []);
  assert.equal(persisted().u2.session.refreshToken, RT_U2);
  assert.deepEqual(storageFull(), []);
});
