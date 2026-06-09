/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-value-codec.test.ts                           :+:      :+:    :+:   */
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
  decodeLiveValue,
  encodeLiveValue,
  toDisplayString,
  toNumberValue,
} from "../../src/shared/notion-database-sys/src/store/live/liveValueCodec.ts";
import type { LiveColumnSchema } from "../../src/shared/notion-database-sys/src/store/live/liveTypes.ts";

const MOUNT = { dbId: "db-1", table: "orders" };
const prop = (type: string, id = "p") => ({ id, name: id, type }) as Parameters<typeof decodeLiveValue>[1];

const FK_COLUMN: LiveColumnSchema = {
  name: "customer_id",
  native_type: "uuid",
  normalized_type: "uuid",
  nullable: true,
  default: null,
  enum_values: null,
  references: { table: "customers", column: "id" },
  inferred: false,
};

test("numbers stay numbers; numeric strings coerce; junk → null", () => {
  assert.equal(decodeLiveValue(12.5, prop("number"), undefined, MOUNT), 12.5);
  assert.equal(decodeLiveValue("42", prop("number"), undefined, MOUNT), 42);
  assert.equal(decodeLiveValue("not-a-number", prop("number"), undefined, MOUNT), null);
  assert.equal(toNumberValue(Number.NaN), null);
  assert.equal(toNumberValue(""), null);
});

test("booleans and dates", () => {
  assert.equal(decodeLiveValue(true, prop("checkbox"), undefined, MOUNT), true);
  assert.equal(decodeLiveValue(0, prop("checkbox"), undefined, MOUNT), false);
  // dates keep the ISO string shape used by the rest of the app
  assert.equal(
    decodeLiveValue("2026-03-29T14:22:50.751Z", prop("date"), undefined, MOUNT),
    "2026-03-29T14:22:50.751Z",
  );
});

test("relation FK scalar → [live page id] in the referenced table", () => {
  assert.deepEqual(
    decodeLiveValue("c-77", prop("relation"), FK_COLUMN, MOUNT),
    ["baas:db-1:customers:c-77"],
  );
  // no FK metadata → no relation targets (defensive)
  assert.deepEqual(decodeLiveValue("c-77", prop("relation"), undefined, MOUNT), []);
  // null FK → empty relation
  assert.deepEqual(decodeLiveValue(null, prop("relation"), FK_COLUMN, MOUNT), []);
});

test("arrays → multi_select string values", () => {
  assert.deepEqual(
    decodeLiveValue(["red", 7, true], prop("multi_select"), undefined, MOUNT),
    ["red", "7", "true"],
  );
  assert.deepEqual(decodeLiveValue("solo", prop("multi_select"), undefined, MOUNT), ["solo"]);
  assert.deepEqual(decodeLiveValue(null, prop("multi_select"), undefined, MOUNT), []);
});

test("select keeps the raw value (option ids = values); json → display string", () => {
  assert.equal(decodeLiveValue("paid", prop("select"), undefined, MOUNT), "paid");
  assert.equal(
    decodeLiveValue({ a: 1, b: [2] }, prop("id"), undefined, MOUNT),
    '{"a":1,"b":[2]}',
  );
  assert.equal(toDisplayString({ nested: { deep: true } }), '{"nested":{"deep":true}}');
});

test("null handling: title → empty string, scalars → null", () => {
  assert.equal(decodeLiveValue(null, prop("title"), undefined, MOUNT), "");
  assert.equal(decodeLiveValue(undefined, prop("text"), undefined, MOUNT), null);
  assert.equal(decodeLiveValue(null, prop("number"), undefined, MOUNT), null);
  // titles render whatever the column holds, string-rendered
  assert.equal(decodeLiveValue(1009, prop("title"), undefined, MOUNT), "1009");
});

test("encode direction: text and multi_select round-trip (full goldens in live-encode.test)", () => {
  assert.equal(encodeLiveValue("x", prop("text"), undefined), "x");
  assert.deepEqual(encodeLiveValue(["a"], prop("multi_select"), undefined), ["a"]);
});
