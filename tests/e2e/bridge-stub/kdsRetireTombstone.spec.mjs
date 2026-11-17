/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   kdsRetireTombstone.spec.mjs                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/17 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/17 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ADR 0054 C7.5: on an origin full to the last character the migration's flag never fits, so the
// legacy state key is tombstoned instead. A later load whose IndexedDB fails must then be pull-only
// (it pushed the frozen legacy pair before, devil C7-N1b), and a load with room stores the flag.
// Caveat: the filler is sized by a binary search on one key, so the origin is full for this
// engine's own accounting at that moment; a write the app makes at boot that frees space would let
// the flag fit, and load 1 then fails on "no flag" rather than passing vacuously.

import { expect, test } from "@playwright/test";

import { seedSession } from "../support/bridgeSession.mjs";
import { stubBridge } from "../support/bridgeStub.mjs";

const STATE = "osionos.knownDatabaseState.v1";
const PUSHED = "osionos.objectDb.pushed.v1";
const FLAG = "osionos.kds.idb";
const TOMBSTONE = '{"kdsRetired":"idb"}';
const FILLER = "e2e:filler"; // not a page cache (osio:pages:), so nothing evicts it
const IDB_FAILS = "e2e:kds-idb-fails"; // sessionStorage: survives a reload, own quota

/** db-x as a user database (no seed has this id) holding `values`. */
function withDb(values) {
  const at = "2026-11-17T00:00:00.000Z";
  const pages = Object.fromEntries(values.map((value, index) => [`db-x-r${index}`, {
    id: `db-x-r${index}`, databaseId: "db-x", properties: { t: value }, content: [], createdAt: at, updatedAt: at,
  }]));
  const database = { id: "db-x", name: "db-x", titlePropertyId: "t", properties: { t: { id: "t", name: "Name", type: "title" } } };
  return { databases: { "db-x": database }, pages, views: {} };
}

/** Fails every open of the durable copy's IndexedDB while the session flag is set. */
function failKdsIndexedDb(key) {
  if (sessionStorage.getItem(key) !== "1") return;
  const open = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function openUnlessKds(name, ...rest) {
    if (name === "osionos-kds") throw new DOMException("e2e: IndexedDB fails", "UnknownError");
    return open.call(this, name, ...rest);
  };
}

/** Writes the legacy pair, then grows FILLER until one more character is refused. */
function fillOrigin({ state, pushed, keys }) {
  localStorage.setItem(keys.STATE, state);
  localStorage.setItem(keys.PUSHED, pushed);
  let low = 0;
  let high = 16 * 1024 * 1024;
  while (low < high) {
    const size = Math.ceil((low + high) / 2);
    try { localStorage.setItem(keys.FILLER, "x".repeat(size)); low = size; } catch { high = size - 1; }
  }
  localStorage.setItem(keys.FILLER, "x".repeat(low));
  try { localStorage.setItem("e2e:probe", "x"); return "room left"; } catch { return "full"; }
}

const legacyKeys = (page) => page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])), [STATE, PUSHED, FLAG]);

function bridgeFor(page) {
  const bridge = { server: withDb(["x-new-1", "x-new-2"]), posts: [], gets: 0 };
  return stubBridge(page, (url, request) => {
    if (url.pathname !== "/api/object-databases") return { json: url.pathname === "/api/pages/all" ? [] : {} };
    if (request.method() === "GET") {
      bridge.gets += 1;
      return { json: { databases: [{ dbKey: "db-x", state: bridge.server }] } };
    }
    bridge.posts.push(request.postDataJSON()?.dbKey);
    return { json: {} };
  }).then(() => bridge);
}

test("a full origin tombstones the legacy state, a load without IndexedDB stays pull-only, room stores the flag", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const bridge = await bridgeFor(page);
  await seedSession(page, {});
  await page.addInitScript(failKdsIndexedDb, IDB_FAILS);
  await page.route(`${baseURL}/e2e-seed`, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>seed</title>" }));
  await page.goto(`${baseURL}/e2e-seed`);
  const state = JSON.stringify(withDb(["x-local-1", "x-local-2"]));
  const pushed = JSON.stringify({ "db-x": "an-older-hash" }); // db-x is dirty: a legacy load pushes it
  expect(await page.evaluate(fillOrigin, { state, pushed, keys: { STATE, PUSHED, FILLER } })).toBe("full");

  // Load 1: the flag is refused, the state key is tombstoned and the push record goes.
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await expect.poll(() => legacyKeys(page), { timeout: 30_000 }).toEqual({ [STATE]: TOMBSTONE, [PUSHED]: null, [FLAG]: null });

  // Load 2: IndexedDB fails; the tombstone makes it pull-only.
  await page.evaluate((key) => sessionStorage.setItem(key, "1"), IDB_FAILS);
  bridge.posts = [];
  const getsBefore = bridge.gets;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Databases are read-only in this tab")).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => bridge.gets, { timeout: 30_000 }).toBeGreaterThan(getsBefore);
  await page.waitForTimeout(3_000); // a fallback-legacy load pushes right after its pull
  expect(bridge.posts.filter((dbKey) => dbKey === "db-x")).toEqual([]);

  // Load 3: room again; the flag is stored and the tombstone removed.
  await page.evaluate(([filler, key]) => { localStorage.removeItem(filler); sessionStorage.removeItem(key); }, [FILLER, IDB_FAILS]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => legacyKeys(page), { timeout: 30_000 }).toEqual({ [STATE]: null, [PUSHED]: null, [FLAG]: "1" });
});
