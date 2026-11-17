/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   user-store-refresh-storage-full.test.ts            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0056 A1–A4: a full origin during sign-in or token refresh. The page caches give their room
// to the session; a write that still does not fit keeps the tab signed in and says so.

import assert from "node:assert/strict";
import test from "node:test";
import { BRIDGE_KEY, fillPageCache, persisted, reset, resultKey, signIn, storage, stubBridge, userStore, useToastStore } from "./user-store-fixtures.ts";

const { useUserStore } = userStore;
const RT = "osb_rt.u1-first.sig";
const RT2 = "osb_rt.u1-secnd.sig";
const SESSION_KEYS = [BRIDGE_KEY, "osionos:active-accounts", "osionos:user-workspaces", "osionos:user-context"];

const stickyNotices = () => useToastStore.getState().toasts.filter((toast) => toast.durationMs === null && /reload/.test(toast.description ?? ""));

for (const key of SESSION_KEYS) {
  test(`A1 a sign-in on a full origin makes room for ${key} from the page caches`, () => {
    reset();
    const cache = fillPageCache(4_000);
    storage.fullWhilePageCached.add(key);
    signIn("u1", RT);
    assert.equal(storage.getItem(cache), null, "the page cache gave its room");
    assert.ok(storage.getItem(key), `${key} was written`);
    assert.equal(persisted().u1.session.refreshToken, RT);
  });
}

test("A1 persistRefreshed makes room for the rotated record from the page caches", async () => {
  reset();
  signIn("u1", RT);
  const cache = fillPageCache(4_000);
  storage.fullWhilePageCached.add(BRIDGE_KEY);
  stubBridge({ refreshTo: RT2 });
  assert.equal(await useUserStore.getState().refreshAccount("u1"), "refreshed");
  assert.equal(storage.getItem(cache), null);
  assert.equal(persisted().u1.session.refreshToken, RT2);
});

test("A2 applyRefreshed sets the live session before it writes the record", async () => {
  reset();
  signIn("u1", RT);
  stubBridge({ refreshTo: RT2 });
  let storedWhenLive: string | undefined;
  const stop = useUserStore.subscribe((state) => {
    if (storedWhenLive === undefined && state.sessions.u1?.refreshToken === RT2) storedWhenLive = persisted().u1.session.refreshToken;
  });
  await useUserStore.getState().refreshAccount("u1");
  stop();
  assert.equal(storedWhenLive, RT, "memory had the new pair before the record");
  assert.equal(persisted().u1.session.refreshToken, RT2);
});

test("A2 a refused record write neither throws nor loses the rotated pair in memory", async () => {
  reset();
  signIn("u1", RT);
  storage.refused.add(BRIDGE_KEY);
  stubBridge({ refreshTo: RT2 });
  assert.equal(await useUserStore.getState().refreshAccount("u1"), "refreshed");
  assert.equal(useUserStore.getState().sessions.u1.refreshToken, RT2);
});

test("A3 the result makes room from the page caches when the record fits and the result does not", async () => {
  reset();
  signIn("u1", RT);
  const cache = fillPageCache(4_000);
  storage.limit = storage.used() + 20;
  stubBridge({ refreshTo: RT2 });
  assert.equal(await useUserStore.getState().refreshAccount("u1"), "refreshed");
  assert.equal(JSON.parse(storage.getItem(resultKey("u1")) ?? "{}").refreshToken, RT2);
  assert.equal(storage.getItem(cache), null);
});

test("A3 a refused persist leaves a published result, and the next run adopts it with one rotate call", async () => {
  reset();
  signIn("u1", RT);
  storage.refused.add(BRIDGE_KEY);
  const calls = stubBridge({ refreshTo: RT2 });
  assert.equal(await useUserStore.getState().refreshAccount("u1"), "refreshed");
  assert.equal(persisted().u1.session.refreshToken, RT, "the record kept the old pair");
  assert.equal(JSON.parse(storage.getItem(resultKey("u1")) ?? "{}").prev, RT);
  assert.equal(await useUserStore.getState().refreshAccount("u1"), "adopted");
  assert.deepEqual(calls, [RT], "the rotated-out token is never sent again");
});

test("A4 a sign-in whose record does not fit shows one sticky notice that it will not survive a reload", () => {
  reset();
  storage.refused.add(BRIDGE_KEY);
  signIn("u1", RT);
  assert.equal(useUserStore.getState().sessions.u1.refreshToken, RT, "this tab stays signed in");
  assert.equal(stickyNotices().length, 1);
  assert.equal(stickyNotices()[0].title, "Browser storage is full");
});

test("A4 a refreshed record that does not fit shows the notice once, however many writes fail", async () => {
  reset();
  signIn("u1", RT);
  storage.refused.add(BRIDGE_KEY);
  stubBridge({ refreshTo: RT2 });
  await useUserStore.getState().refreshAccount("u1");
  signIn("u2", "osb_rt.u2-first.sig");
  assert.equal(stickyNotices().length, 1);
});
