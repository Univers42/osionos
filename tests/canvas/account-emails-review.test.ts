/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   account-emails-review.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// F-3b review round, client side: an outage header keeps what is held, a dropped hydrate
// ends loading, a user switch forgets who to re-read for, and a rejected action frees the modal.

import assert from "node:assert/strict";
import test from "node:test";

import { withBridge } from "./support/stub-bridge.ts";
import "./support/emails-env.ts";

const { useAccountEmailsStore } = await import("../../src/store/settings/useAccountEmailsStore.ts");
const { advanceAccountEpoch } = await import("../../src/store/settings/accountEpoch.ts");
const { TEMPORARILY_DOWN } = await import("../../src/features/settings/profile/emailCopy.ts");
const { runBusy } = await import("../../src/features/settings/profile/runBusy.ts");

const stamp = "2026-10-01T00:00:00Z";
const record = (userId: string, id: string, email: string, isPrimary: boolean) =>
  ({ _id: id, userId, email, isPrimary, verifiedAt: isPrimary ? stamp : null, createdAt: stamp, updatedAt: stamp, removedAt: null });
const PRIMARY = record("u1", "primary-u1", "me@example.com", true);
const PENDING = record("u1", "row-1", "other@example.com", false);
const store = useAccountEmailsStore;

test("R3 a list flagged x-emails-secondaries: unavailable keeps the held secondary and shows the outage copy", async () => {
  store.setState({ data: [PRIMARY, PENDING], loading: false, error: null });
  await withBridge(() => ({ body: [PRIMARY], headers: { "x-emails-secondaries": "unavailable" } }), async () => {
    await store.getState().hydrate("u1", "me@example.com");
  });
  const { data, error, loading } = store.getState();
  assert.deepEqual([data.map((row) => row._id), error, loading], [["primary-u1", "row-1"], TEMPORARILY_DOWN, false]);
});

test("R4 a hydrate dropped by the epoch guard still ends with loading false", async () => {
  store.setState({ data: [], loading: false, error: null });
  await withBridge(() => { advanceAccountEpoch(); return { body: [PRIMARY] }; }, async () => {
    await store.getState().hydrate("u1", "me@example.com");
  });
  assert.equal(store.getState().loading, false);
});

test("R4 reset forgets who to re-read for, so a later mutation does not hydrate the old user", async () => {
  await withBridge(() => ({ body: [PRIMARY] }), async () => {
    await store.getState().hydrate("u1", "me@example.com");
  });
  store.getState().reset("u2", "two@example.com");
  const calls = await withBridge(() => ({ status: 202, body: { id: "r", sentTo: "x" } }), async () => {
    await store.getState().add("x@example.com");
  });
  assert.deepEqual(calls.map((call) => call.method), ["POST"]);
});

test("R6 a rejecting action leaves busy false", async () => {
  const seen: boolean[] = [];
  await assert.rejects(runBusy((busy) => seen.push(busy), async () => { throw new Error("boom"); }), /boom/);
  assert.deepEqual(seen, [true, false]);
});
