/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-encode.test.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { encodeDateValue, encodeLiveValue } from "../../src/shared/notion-database-sys/src/store/live/liveValueCodec.ts";
import type { LiveColumnSchema } from "../../src/shared/notion-database-sys/src/store/live/liveTypes.ts";

const prop = (type: string, id = "p") => ({ id, name: id, type }) as Parameters<typeof encodeLiveValue>[1];
const col = (overrides: Partial<LiveColumnSchema>): LiveColumnSchema => ({
  name: "c", native_type: "text", normalized_type: "text", nullable: true,
  default: null, enum_values: null, references: null, inferred: false, ...overrides,
});

test("numbers, checkboxes, selects, multi-selects encode to engine scalars", () => {
  assert.equal(encodeLiveValue(12.5, prop("number")), 12.5);
  assert.equal(encodeLiveValue("42", prop("number")), 42);
  assert.equal(encodeLiveValue("junk", prop("number")), null);
  assert.equal(encodeLiveValue(true, prop("checkbox")), true);
  assert.equal(encodeLiveValue(0, prop("checkbox")), false);
  assert.equal(encodeLiveValue("paid", prop("select")), "paid"); // option id === value
  assert.equal(encodeLiveValue("", prop("select")), null); // cleared select → NULL
  assert.deepEqual(encodeLiveValue(["a", "b"], prop("multi_select")), ["a", "b"]);
  assert.deepEqual(encodeLiveValue("solo", prop("multi_select")), ["solo"]);
});

test("date vs datetime: the COLUMN type picks the wire shape", () => {
  const iso = "2026-03-29T14:22:50.751Z";
  assert.equal(encodeLiveValue(iso, prop("date"), col({ normalized_type: "date" })), "2026-03-29");
  assert.equal(encodeLiveValue(iso, prop("date"), col({ normalized_type: "datetime" })), iso);
  // date-only input widened for a datetime column (UTC midnight, deterministic)
  assert.equal(
    encodeLiveValue("2026-03-29", prop("date"), col({ normalized_type: "datetime" })),
    "2026-03-29T00:00:00.000Z",
  );
  // no column metadata → pass the stored string through untouched
  assert.equal(encodeLiveValue(iso, prop("date")), iso);
  // idempotent: encoding an already-encoded date is stable
  const once = encodeLiveValue(iso, prop("date"), col({ normalized_type: "date" }));
  assert.equal(encodeLiveValue(once, prop("date"), col({ normalized_type: "date" })), once);
  assert.equal(encodeDateValue("", col({ normalized_type: "date" })), null);
  assert.equal(encodeDateValue("not a date", col({ normalized_type: "date" })), "not a date");
});

test("relation: live page id → FK scalar; empty → null; numeric FK coerces", () => {
  const fk = col({ name: "customer_id", references: { table: "customers", column: "id" } });
  assert.equal(encodeLiveValue(["baas:db-1:customers:c-77"], prop("relation"), fk), "c-77");
  assert.equal(encodeLiveValue([], prop("relation"), fk), null);
  assert.equal(encodeLiveValue(null, prop("relation"), fk), null);
  const numericFk = col({ normalized_type: "integer", references: { table: "customers", column: "id" } });
  assert.equal(encodeLiveValue(["baas:db-1:customers:42"], prop("relation"), numericFk), 42);
  // idempotent: an already-extracted pk passes through (re-encode safety)
  assert.equal(encodeLiveValue("c-77", prop("relation"), fk), "c-77");
  // pk segments containing colons survive (page-id parse keeps the remainder)
  assert.equal(encodeLiveValue(["baas:db-1:customers:a:b"], prop("relation"), fk), "a:b");
});

test("read-only and unsupported properties are skipped (undefined)", () => {
  assert.equal(encodeLiveValue("anything", prop("id")), undefined); // 'id' = read-only render
  assert.equal(encodeLiveValue("x", prop("formula")), undefined);
  assert.equal(encodeLiveValue("x", prop("rollup")), undefined);
});

test("text-ish values: display strings, json columns parse-or-passthrough", () => {
  assert.equal(encodeLiveValue("hello", prop("text")), "hello");
  assert.equal(encodeLiveValue(null, prop("text")), null);
  assert.equal(encodeLiveValue(null, prop("title")), ""); // titles render empty, never NULL
  assert.equal(encodeLiveValue(1009, prop("title")), "1009");
  const jsonCol = col({ normalized_type: "json" });
  assert.deepEqual(encodeLiveValue('{"a":1}', prop("text"), jsonCol), { a: 1 });
  assert.equal(encodeLiveValue("not json", prop("text"), jsonCol), "not json");
});
