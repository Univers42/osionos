/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   app-worker.test.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/16 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/16 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// 2026-11-16: a Firefox kept the worker it installed on 2026-10-30 after its fix shipped,
// because /sw.js was cached as immutable for a year and no check asked the server for it. That
// worker answered navigations, so 3,165 of the browser's 7,168 bridge requests were cancelled
// (3 of 7,947 in a fresh profile): "This page couldn't be loaded" on every page opened.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isWorkerReloadSafe, keepAppWorkerCurrent, registerAppWorker } from "../../src/shared/lib/service-worker/appWorker.ts";

type Listener = () => void;

const HELD = "https://osionos.test/sw.js";

/** A browser whose page was loaded under the worker at `controllerUrl` (null: no worker yet).
 *  `failure` is what registering answers when the script cannot be fetched. */
function browser(controllerUrl: string | null, failure: Error | null = null) {
  const listeners = new Set<Listener>();
  const world = { registered: [] as string[], reloads: 0 };
  const host = {
    controller: controllerUrl === null ? null : { scriptURL: controllerUrl },
    register: async (address: string) => {
      if (failure) throw failure;
      world.registered.push(address);
      return {};
    },
    addEventListener: (_type: string, listener: Listener) => { listeners.add(listener); },
    removeEventListener: (_type: string, listener: Listener) => { listeners.delete(listener); },
  } as unknown as ServiceWorkerContainer;
  /** A worker takes control of the page (the browser's "controllerchange"). */
  const takeOver = () => { for (const listener of [...listeners]) { listeners.delete(listener); listener(); } };
  return { host, world, takeOver, reload: () => { world.reloads += 1; } };
}

async function registeredAddress(): Promise<string> {
  const { host, world } = browser(null);
  await registerAppWorker(host);
  return world.registered[0];
}

test("the worker is registered at an address no browser holds a year-long copy of", async () => {
  const address = await registeredAddress();
  assert.notEqual(address, "/sw.js", "Firefox answers /sw.js from its immutable cache entry until 2027-11");
  assert.equal(new URL(address, HELD).pathname, "/sw.js", "the same file, still under the exact nginx location");
});

test("a page loaded under the worker at the held address reloads once the current one takes over", async () => {
  const { host, world, takeOver, reload } = browser(HELD);
  await keepAppWorkerCurrent(host, reload);
  assert.equal(world.reloads, 0, "not before the current worker controls the page");
  takeOver();
  takeOver();
  assert.equal(world.reloads, 1);
});

test("a first visit is not reloaded when its worker claims the page", async () => {
  const { host, world, takeOver, reload } = browser(null);
  await keepAppWorkerCurrent(host, reload);
  takeOver();
  assert.equal(world.reloads, 0);
});

test("a page already under the current address is not reloaded by a newer copy of the script", async () => {
  const { host, world, takeOver, reload } = browser(new URL(await registeredAddress(), HELD).href);
  await keepAppWorkerCurrent(host, reload);
  takeOver();
  assert.equal(world.reloads, 0, "every later edit of sw.js would otherwise reload every user");
});

test("a registration that cannot reach the server fails without arming a later reload", async () => {
  const { host, world, takeOver, reload } = browser(HELD, new TypeError("NetworkError"));
  await assert.rejects(keepAppWorkerCurrent(host, reload), TypeError);
  takeOver();
  assert.equal(world.reloads, 0);
});

const QUIET = { address: "https://osionos.test/#page=1", userHasTyped: false, msSinceLastReload: Infinity };

test("the reload goes ahead on a page with nothing to lose", () => {
  assert.equal(isWorkerReloadSafe(QUIET), true);
});

test("no reload once the user has typed: an edit made before the first server load is not flushed", () => {
  assert.equal(isWorkerReloadSafe({ ...QUIET, userHasTyped: true }), false);
});

test("no reload while the single-use sign-in token is in the address", () => {
  assert.equal(isWorkerReloadSafe({ ...QUIET, address: "https://osionos.test/?bridge_token=abc" }), false);
  assert.equal(isWorkerReloadSafe({ ...QUIET, address: "https://osionos.test/#bridge_token=abc" }), false);
});

test("no second reload within 10 s: worker bytes that change on every fetch cannot loop the tab", () => {
  assert.equal(isWorkerReloadSafe({ ...QUIET, msSinceLastReload: 9_999 }), false);
  assert.equal(isWorkerReloadSafe({ ...QUIET, msSinceLastReload: 10_001 }), true);
});

test("the web server lets the browser revalidate the worker script on every check", () => {
  const conf = readFileSync(new URL("../../docker/services/node/nginx.conf", import.meta.url), "utf8");
  const block = /location = \/sw\.js \{([^}]*)\}/.exec(conf)?.[1] ?? "";
  assert.match(block, /add_header Cache-Control "no-cache";/, "an exact /sw.js location outranks the one-year asset rule");
  assert.doesNotMatch(block, /immutable|expires/);
});
