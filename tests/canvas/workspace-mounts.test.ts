/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   workspace-mounts.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import test from "node:test";
import assert from "node:assert/strict";
import { control, installWorkspaceMountStubs } from "./workspace-mounts-stubs.ts";

installWorkspaceMountStubs();
const { getWorkspaceMounts, subscribeWorkspaceMounts } = await import("../../src/features/ide/vfs/workspaceMounts.ts");
const { useSandboxHealthStore } = await import("../../src/features/ide/model/sandboxHealthStore.ts");
const { publishFsEvent } = await import("../../src/features/ide/model/ideFsEvents.ts");

const WS = "ws-1";
const setHealth = (state: "online" | "unavailable"): void => useSandboxHealthStore.setState({ state, workspaceId: WS });
/** The sandbox provider has symlinks; the page provider does not. */
const backendIsSandbox = (): boolean => getWorkspaceMounts(WS).resolve(`workspace://${WS}/`).provider.capabilities().symlinks;

/** Counts live health subscriptions: a leaked one keeps a dead watch's listener forever. */
function countSubscriptions(): { live: () => number; restore: () => void } {
  let live = 0;
  const original = useSandboxHealthStore.subscribe.bind(useSandboxHealthStore);
  useSandboxHealthStore.subscribe = (listener: Parameters<typeof original>[0]) => {
    live++;
    const off = original(listener);
    return () => { live--; off(); };
  };
  return { live: () => live, restore: () => { useSandboxHealthStore.subscribe = original; } };
}

test("subscribeWorkspaceMounts: the FIRST health event may be the flip and still fires onChange", () => {
  setHealth("online");
  let fired = 0;
  const off = subscribeWorkspaceMounts(WS, () => { fired++; });

  setHealth("unavailable");
  off();

  assert.equal(fired, 1);
  assert.equal(backendIsSandbox(), false, "resolve() now returns the page-file backend");
  setHealth("online");
  assert.equal(backendIsSandbox(), true, "and the sandbox again once it is back");
});

test("watch: an earlier listener calling current() cannot hide the flip from this watch", async () => {
  setHealth("online");
  control.pageStoreSubscribes = 0;
  const provider = getWorkspaceMounts(WS).resolve(`workspace://${WS}/`).provider;
  const early = useSandboxHealthStore.subscribe(() => { provider.capabilities(); });
  const stop = new AbortController();
  const watching = provider.watch(getWorkspaceMounts(WS).resolve(`workspace://${WS}/`).path, () => undefined, stop.signal);

  setHealth("unavailable");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(control.pageStoreSubscribes, 1, "the watch moved onto the page-file backend");
  early();
  stop.abort();
  await watching;
});

test("watch: a backend watch that rejects ends the watch with its error and releases the health subscription", async () => {
  setHealth("unavailable");
  control.failPageStoreSubscribe = true;
  const spy = countSubscriptions();
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  try {
    const { provider, path } = getWorkspaceMounts(WS).resolve(`workspace://${WS}/`);
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("watch never ended")), 500));

    await assert.rejects(Promise.race([provider.watch(path, () => undefined, new AbortController().signal), timeout]), /page store subscribe failed/);
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(unhandled, [], "no unhandled rejection");
    assert.equal(spy.live(), 0, "health subscription released");
  } finally {
    process.off("unhandledRejection", onUnhandled);
    control.failPageStoreSubscribe = false;
    spy.restore();
  }
});

test("watch: aborting releases the health subscription", async () => {
  setHealth("unavailable");
  const spy = countSubscriptions();
  const { provider, path } = getWorkspaceMounts(WS).resolve(`workspace://${WS}/`);
  const stop = new AbortController();
  try {
    const watching = provider.watch(path, () => undefined, stop.signal);
    assert.equal(spy.live(), 1);

    stop.abort();
    await watching;

    assert.equal(spy.live(), 0);
  } finally {
    spy.restore();
  }
});

test("watch: a rejecting backend watch removes its abort listener from the caller's signal", async () => {
  setHealth("unavailable");
  control.failPageStoreSubscribe = true;
  const signal = new AbortController().signal;
  let added = 0;
  let removed = 0;
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  signal.addEventListener = ((...args: Parameters<typeof add>) => { added++; add(...args); }) as typeof add;
  signal.removeEventListener = ((...args: Parameters<typeof remove>) => { removed++; remove(...args); }) as typeof remove;
  try {
    const { provider, path } = getWorkspaceMounts(WS).resolve(`workspace://${WS}/`);
    await assert.rejects(provider.watch(path, () => undefined, signal), /page store subscribe failed/);
    assert.equal(added, 1);
    assert.ok(removed >= 1, "the listener on the caller's signal is released");
  } finally {
    control.failPageStoreSubscribe = false;
  }
});

test("watch online: a file the shell writes reaches the explorer's watch (the fsync feed is wired)", async () => {
  setHealth("online");
  const { provider, path } = getWorkspaceMounts(WS).resolve(`workspace://${WS}/`);
  const seen: string[] = [];
  const stop = new AbortController();
  const watching = provider.watch(path, (event) => { seen.push(`${event.type} ${event.path.segments.join("/")}`); }, stop.signal);
  await Promise.resolve();
  publishFsEvent(WS, { event: "write", path: "42/gnl/main.c", hash: "0000000000000000" });
  publishFsEvent(WS, { event: "delete", path: "zz-probe.c" });
  stop.abort();
  await watching;
  assert.deepEqual(seen, ["write 42/gnl/main.c", "delete zz-probe.c"], "the explorer refreshed only on its Refresh button before");
});
