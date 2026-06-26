/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-place-writesafety.test.ts                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* The place interpretation must never corrupt the engine: editing a place
 * column writes the NAME back, a re-decode (reload) produces no phantom write,
 * and the DERIVED __place (no engine column) is never written. */

import assert from "node:assert/strict";
import test from "node:test";

import { buildLiveState } from "../../src/shared/notion-database-sys/src/store/live/liveStateBuilder.ts";
import { diffLiveState } from "../../src/shared/notion-database-sys/src/store/live/liveStateDiff.ts";
import type { LiveColumnSchema, LiveSchemaResponse } from "../../src/shared/notion-database-sys/src/store/live/liveTypes.ts";

const col = (name: string, type: LiveColumnSchema["normalized_type"] = "text"): LiveColumnSchema =>
  ({ name, native_type: type, normalized_type: type, nullable: true, default: null, enum_values: null, references: null, inferred: false });

// city table → city is a place column; coords table → derived __place.
const CITY = { dbId: "c", table: "restaurant" };
const CITY_SCHEMA: LiveSchemaResponse = { dbId: "c", engine: "sqlite", capabilities: null, tables: [{ name: "restaurant", primary_key: ["id"], columns: [col("id", "integer"), col("city")] }] };
const CITY_ROWS = [{ id: 1, city: "Bordeaux" }, { id: 2, city: "Marseille" }];

const GEO = { dbId: "g", table: "spots" };
const GEO_SCHEMA: LiveSchemaResponse = { dbId: "g", engine: "postgresql", capabilities: null, tables: [{ name: "spots", primary_key: ["id"], columns: [col("id", "integer"), col("label"), col("lat", "float"), col("lng", "float")] }] };
const GEO_ROWS = [{ id: 1, label: "A", lat: 48.85, lng: 2.35 }];

test("editing a place column writes the NAME back to the engine (not coordinates)", () => {
  const prev = buildLiveState(CITY_SCHEMA, CITY, { restaurant: CITY_ROWS });
  const next = structuredClone(prev);
  next.pages["baas:c:restaurant:1"].properties.city = { address: "Lyon" }; // inline-editor form
  const diff = diffLiveState(next, prev, "baas:c:restaurant");
  assert.equal(diff.cellChanges.length, 1);
  assert.equal(diff.cellChanges[0].column, "city");
  assert.deepEqual(diff.cellChanges[0].value, { address: "Lyon" }); // publisher re-encodes → "Lyon"
});

test("a re-decoded place (reload) produces NO phantom write", () => {
  const a = buildLiveState(CITY_SCHEMA, CITY, { restaurant: CITY_ROWS });
  const b = buildLiveState(CITY_SCHEMA, CITY, { restaurant: CITY_ROWS }); // identical reload
  const diff = diffLiveState(b, a, "baas:c:restaurant");
  assert.equal(diff.cellChanges.length, 0, "geocoded place re-decode must be stable");
});

test("the DERIVED __place is never written (no engine column)", () => {
  const prev = buildLiveState(GEO_SCHEMA, GEO, { spots: GEO_ROWS });
  assert.equal(prev.databases["baas:g:spots"].properties.__place?.type, "place");
  const next = structuredClone(prev);
  next.pages["baas:g:spots:1"].properties.__place = { lat: 99, lng: 99, address: "tampered" };
  const diff = diffLiveState(next, prev, "baas:g:spots");
  assert.equal(diff.cellChanges.filter((change) => change.column === "__place").length, 0);
});
