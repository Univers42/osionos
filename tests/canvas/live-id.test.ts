/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-id.test.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/09 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/09 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  formatLiveDatabaseId,
  formatLivePageId,
  isLiveDatabaseId,
  parseLiveDatabaseId,
  parseLivePageId,
} from "../../src/shared/notion-database-sys/src/store/live/liveTypes.ts";

const DB_ID = "1f0c5f2e-9f9a-4f7e-8c9f-1234567890ab";

test("isLiveDatabaseId: baas: namespace only", () => {
  assert.equal(isLiveDatabaseId(`baas:${DB_ID}:orders`), true);
  assert.equal(isLiveDatabaseId("baas:"), true); // namespace claim — parse decides validity
  assert.equal(isLiveDatabaseId("db-tasks"), false);
  assert.equal(isLiveDatabaseId("ws-folders"), false);
  assert.equal(isLiveDatabaseId(null), false);
  assert.equal(isLiveDatabaseId(undefined), false);
});

test("database id: format/parse round trip", () => {
  const id = formatLiveDatabaseId({ dbId: DB_ID, table: "orders" });
  assert.equal(id, `baas:${DB_ID}:orders`);
  assert.deepEqual(parseLiveDatabaseId(id), { dbId: DB_ID, table: "orders" });
});

test("database id: malformed ids are rejected", () => {
  assert.equal(parseLiveDatabaseId("baas:"), null);
  assert.equal(parseLiveDatabaseId("baas:only-db"), null);
  assert.equal(parseLiveDatabaseId(`baas:${DB_ID}:`), null);
  assert.equal(parseLiveDatabaseId(`baas::orders`), null);
  assert.equal(parseLiveDatabaseId(`notbaas:${DB_ID}:orders`), null);
  // four segments is a PAGE id, not a database id
  assert.equal(parseLiveDatabaseId(`baas:${DB_ID}:orders:row-1`), null);
});

test("page id: round trip with a plain pk", () => {
  const id = formatLivePageId({ dbId: DB_ID, table: "orders" }, "o-1001");
  assert.equal(id, `baas:${DB_ID}:orders:o-1001`);
  assert.deepEqual(parseLivePageId(id), { dbId: DB_ID, table: "orders", pk: "o-1001" });
});

test("page id: pk containing colons survives the round trip", () => {
  const pk = "urn:isbn:978-3-16:rev:7";
  const id = formatLivePageId({ dbId: DB_ID, table: "books" }, pk);
  const parsed = parseLivePageId(id);
  assert.equal(parsed?.pk, pk);
  assert.equal(parsed?.dbId, DB_ID);
  assert.equal(parsed?.table, "books");
});

test("page id: numeric pks format as strings; malformed ids are rejected", () => {
  assert.equal(formatLivePageId({ dbId: "d", table: "t" }, 42), "baas:d:t:42");
  assert.equal(parseLivePageId("baas:d:t"), null); // database id, no pk
  assert.equal(parseLivePageId("baas:d:t:"), null); // empty pk
  assert.equal(parseLivePageId("other:d:t:1"), null);
});
