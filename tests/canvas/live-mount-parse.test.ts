/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-mount-parse.test.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { parseMounts } from "../../src/widgets/database-view/model/liveMountParse.ts";

// The full registry list the bridge serves for tenant `agency` — the panel must
// surface ALL of these, not just the 3-entry VITE_BAAS_LIVE_MOUNTS mock subset.
const REGISTRY_RESPONSE = [
  { dbId: "8e08344a-3182-425d-b802-326610e38dba", name: "osionos-restaurant", engine: "postgresql" },
  { dbId: "11111111-0000-4000-a000-000000000002", name: "osionos-finance", engine: "postgresql" },
  { dbId: "11111111-0000-4000-a000-000000000003", name: "osionos-iot", engine: "mongodb" },
  { dbId: "42c85133-c805-40c5-a260-04251834a337", name: "mongo-activity", engine: "mongodb" },
  { dbId: "028b32b2-78f2-405f-81e3-fa690c4649dc", name: "mysql-ops", engine: "mysql" },
  { dbId: "59939f19-7e8d-4876-a57f-61b3e7bb37be", name: "pg-commerce", engine: "postgresql" },
  { dbId: "11111111-0000-4000-a000-000000000007", name: "agency-db", engine: "postgresql" },
];
const MOCK_NAMES = ["pg-commerce", "mysql-ops", "mongo-activity"];

test("parses the full registry list — all databases, never just the mock subset", () => {
  const mounts = parseMounts(REGISTRY_RESPONSE);
  assert.equal(mounts.length, 7, "all 7 registry databases must parse through");
  const names = mounts.map((m) => m.name);
  assert.ok(names.includes("osionos-restaurant"), "registry-only db must survive");
  assert.ok(names.includes("agency-db"), "registry-only db must survive");
  // Regression guard: the result is NOT limited to the 3 mock mounts.
  assert.ok(!names.every((n) => MOCK_NAMES.includes(n)), "must not collapse to the mock subset");
});

test("accepts the registry `id` shape and the bridge `dbId` shape", () => {
  const mounts = parseMounts([
    { id: "abc", name: "by-id", engine: "postgresql" },
    { dbId: "def", name: "by-dbid", engine: "mysql" },
  ]);
  assert.deepEqual(mounts.map((m) => m.dbId), ["abc", "def"]);
});

test("defaults missing name → dbId and missing engine → 'unknown'", () => {
  const [m] = parseMounts([{ dbId: "x9" }]);
  assert.equal(m.name, "x9");
  assert.equal(m.engine, "unknown");
});

test("drops junk entries (null, non-object, no id)", () => {
  const mounts = parseMounts([null, 42, "nope", {}, { name: "no-id" }, { dbId: "keep" }]);
  assert.deepEqual(mounts.map((m) => m.dbId), ["keep"]);
});

test("non-array payloads yield an empty list", () => {
  assert.deepEqual(parseMounts(null), []);
  assert.deepEqual(parseMounts(undefined), []);
  assert.deepEqual(parseMounts({ databases: [] }), []);
});
