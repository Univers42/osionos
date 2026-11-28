/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   object-db-account-sync.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0057 BR3: the object-database sync acts only for the latest account id. Every effect run
// gets its own deferred loader, so each test picks the order the two imports resolve in.

import assert from "node:assert/strict";
import test from "node:test";

const { syncObjectDbForAccount } = await import("../../src/app/objectDbAccountSync.ts");

type Sync = { resetObjectDatabaseSync: () => void; startObjectDatabaseSync: () => void };

function harness() {
  const calls = { resets: 0, starts: 0 };
  const sync: Sync = {
    resetObjectDatabaseSync: () => { calls.resets += 1; },
    startObjectDatabaseSync: () => { calls.starts += 1; },
  };
  const pending: Array<() => Promise<void>> = [];
  const previousAccount = { current: null as string | null };
  const run = (accountId: string) => {
    let release!: (value: Sync) => void;
    const loaded = new Promise<Sync>((resolve) => { release = resolve; });
    pending.push(async () => { release(sync); await new Promise((done) => setImmediate(done)); });
    return syncObjectDbForAccount(() => loaded, previousAccount, accountId);
  };
  const resolve = (index: number) => pending[index]();
  return { calls, previousAccount, run, resolve };
}

type Tab = ReturnType<typeof harness>;

// What happened after the boot, so a switch is judged on its own calls.
function since(tab: Tab) {
  const before = { ...tab.calls };
  return () => ({ resets: tab.calls.resets - before.resets, starts: tab.calls.starts - before.starts });
}

// Boots to "user-a" the way App does: "" commits first, init's id second, both imports pending.
async function boot(reversed: boolean): Promise<{ tab: Tab; cleanup: () => void }> {
  const tab = harness();
  const cleanupEmpty = tab.run("");
  cleanupEmpty();
  const cleanup = tab.run("user-a");
  for (const index of reversed ? [1, 0] : [0, 1]) await tab.resolve(index);
  return { tab, cleanup };
}

for (const reversed of [false, true]) {
  const order = reversed ? "reversed" : "in order";

  test(`(a) boot "" then id, resolved ${order}: 0 resets, 1 start, ref = id`, async () => {
    const { tab } = await boot(reversed);
    assert.deepEqual(tab.calls, { resets: 0, starts: 1 });
    assert.equal(tab.previousAccount.current, "user-a");
  });

  test(`(c) A -> B after a boot resolved ${order}: 1 reset, 1 start`, async () => {
    const { tab, cleanup } = await boot(reversed);
    const switched = since(tab);
    cleanup();
    tab.run("user-b");
    await tab.resolve(2);
    assert.deepEqual(switched(), { resets: 1, starts: 1 });
    assert.equal(tab.previousAccount.current, "user-b");
  });

  test(`(f) StrictMode mount -> cleanup -> mount, resolved ${order}: 0 resets, 1 start`, async () => {
    const tab = harness();
    tab.run("user-a")();
    tab.run("user-a");
    for (const index of reversed ? [1, 0] : [0, 1]) await tab.resolve(index);
    assert.deepEqual(tab.calls, { resets: 0, starts: 1 });
    assert.equal(tab.previousAccount.current, "user-a");
  });
}

test(`(b) "" resolves before the id run starts: 0 resets, 2 starts, ref = id`, async () => {
  const tab = harness();
  const cleanupEmpty = tab.run("");
  await tab.resolve(0);
  cleanupEmpty();
  tab.run("user-a");
  await tab.resolve(1);
  assert.deepEqual(tab.calls, { resets: 0, starts: 2 });
  assert.equal(tab.previousAccount.current, "user-a");
});

test(`(d) A -> "" -> B, "" resolves before B commits: exactly 1 reset, at ""`, async () => {
  const { tab, cleanup } = await boot(false);
  const switched = since(tab);
  cleanup();
  const cleanupEmpty = tab.run("");
  await tab.resolve(2);
  assert.deepEqual(switched(), { resets: 1, starts: 1 });
  cleanupEmpty();
  tab.run("user-b");
  await tab.resolve(3);
  assert.deepEqual(switched(), { resets: 1, starts: 2 });
  assert.equal(tab.previousAccount.current, "user-b");
});

for (const reversed of [false, true]) {
  test(`(d) A -> "" -> B inside one window, resolved ${reversed ? "reversed" : "in order"}: 1 reset, at B`, async () => {
    const { tab, cleanup } = await boot(false);
    const switched = since(tab);
    cleanup();
    tab.run("")();
    tab.run("user-b");
    for (const index of reversed ? [3, 2] : [2, 3]) await tab.resolve(index);
    assert.deepEqual(switched(), { resets: 1, starts: 1 });
    assert.equal(tab.previousAccount.current, "user-b");
  });
}

for (const reversed of [false, true]) {
  test(`(e) A -> B -> C inside one window, resolved ${reversed ? "reversed" : "in order"}: only C acts`, async () => {
    const { tab, cleanup } = await boot(false);
    const switched = since(tab);
    cleanup();
    tab.run("user-b")();
    tab.run("user-c");
    for (const index of reversed ? [3, 2] : [2, 3]) await tab.resolve(index);
    assert.deepEqual(switched(), { resets: 1, starts: 1 });
    assert.equal(tab.previousAccount.current, "user-c");
  });
}

test("(g) unmount, then the import resolves: nothing happens", async () => {
  const tab = harness();
  tab.run("user-a")();
  await tab.resolve(0);
  assert.deepEqual(tab.calls, { resets: 0, starts: 0 });
  assert.equal(tab.previousAccount.current, null);
});

test("(h) a sync that cannot run never calls the loader", () => {
  let loads = 0;
  const previousAccount = { current: null as string | null };
  const cleanup = syncObjectDbForAccount(
    () => { loads += 1; return Promise.reject(new Error("must not load")); },
    previousAccount,
    "user-a",
    () => false,
  );
  cleanup();
  assert.equal(loads, 0);
  assert.equal(previousAccount.current, null);
});
