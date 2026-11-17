/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   session-refresh-publish.test.ts                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0056: when runRefresh publishes a rotation's result for the other tabs, and when not.

import assert from "node:assert/strict";
import test from "node:test";
import { QuotaStorage, leaseKey, resultKey } from "./user-store-fixtures.ts";

const { runRefresh } = await import("../../src/features/auth/model/sessionRefresh.ts");

type Adopt = () => boolean | void;

function deps(storage: QuotaStorage, adopt: Adopt, sent: string[] = []) {
  return {
    userId: "u1",
    storage,
    now: () => 1_000,
    readTokens: () => ({ accessToken: "at", refreshToken: "rt-old" }),
    rotate: async (refreshToken: string) => {
      sent.push(refreshToken);
      return { ok: true as const, accessToken: "at2", refreshToken: "rt-new", expiresAt: undefined };
    },
    adopt,
    signOut: () => undefined,
  };
}

test("S3 an adopt that reports the record gone publishes no result and releases the lease", async () => {
  const storage = new QuotaStorage();
  assert.equal(await runRefresh(deps(storage, () => false)), "refreshed");
  assert.equal(storage.getItem(resultKey("u1")), null);
  assert.equal(storage.getItem(leaseKey("u1")), null);
});

test("S3 an adopt that keeps the record still publishes the result", async () => {
  const storage = new QuotaStorage();
  await runRefresh(deps(storage, () => true));
  assert.equal(JSON.parse(storage.getItem(resultKey("u1")) ?? "{}").refreshToken, "rt-new");
});

test("A3 P5 inverted: an adopt that throws still publishes, and the next run adopts with no second rotate", async () => {
  const storage = new QuotaStorage();
  const sent: string[] = [];
  let throws = true;
  const adopt = () => {
    if (!throws) return true;
    throws = false;
    throw new DOMException("Setting the value exceeded the quota.", "QuotaExceededError");
  };
  await assert.rejects(runRefresh(deps(storage, adopt, sent)));
  assert.equal(JSON.parse(storage.getItem(resultKey("u1")) ?? "{}").prev, "rt-old");
  assert.equal(await runRefresh(deps(storage, adopt, sent)), "adopted");
  assert.deepEqual(sent, ["rt-old"]);
});

test("A3 the result goes through the publish writer the store hands in", async () => {
  const storage = new QuotaStorage();
  storage.refused.add(resultKey("u1"));
  const published: string[] = [];
  const publish = (key: string, text: string) => { published.push(key); return storage.data.set(key, text) !== undefined; };
  await runRefresh({ ...deps(storage, () => true), publish });
  assert.deepEqual(published, [resultKey("u1")]);
  assert.equal(JSON.parse(storage.getItem(resultKey("u1")) ?? "{}").refreshToken, "rt-new");
});
