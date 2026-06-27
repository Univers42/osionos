/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-place-pipeline.test.ts                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/* End-to-end of the live-state build for a city-bearing table (the real
 * osionos-restaurant shape): a standalone `city` column becomes a PLACE
 * (location) attribute, geocoded offline, a Map view is offered, and the
 * value round-trips to the engine as the plain city NAME (editable, safe). */

import assert from "node:assert/strict";
import test from "node:test";

import { buildLiveState } from "../../src/shared/notion-database-sys/src/store/live/liveStateBuilder.ts";
import { LIVE_PLACE_PROPERTY_ID } from "../../src/shared/notion-database-sys/src/store/live/liveViewPresets.ts";
import { decodeLiveValue, encodeLiveValue, placeAddressFromRaw } from "../../src/shared/notion-database-sys/src/store/live/liveValueCodec.ts";
import type {
  LiveColumnSchema,
  LiveSchemaResponse,
} from "../../src/shared/notion-database-sys/src/store/live/liveTypes.ts";

function col(name: string, type: LiveColumnSchema["normalized_type"] = "text"): LiveColumnSchema {
  return { name, native_type: type, normalized_type: type, nullable: true, default: null, enum_values: null, references: null, inferred: false };
}
const CITY_COL = col("city");
const REF = { dbId: "rest-db", table: "restaurant" };
const SCHEMA: LiveSchemaResponse = {
  dbId: "rest-db",
  engine: "sqlite",
  capabilities: null,
  tables: [{ name: "restaurant", primary_key: ["id"], columns: [col("id", "integer"), col("name"), col("cuisine"), CITY_COL] }],
};
const ROWS = [
  { id: 1, name: "Le Train Bleu", cuisine: "French", city: "Bordeaux" },
  { id: 2, name: "La Marseillaise", cuisine: "French", city: "Marseille" },
];

test("standalone city → PLACE attribute (not select) + Map view + geocoded coords", () => {
  const state = buildLiveState(SCHEMA, REF, { restaurant: ROWS });
  const db = state.databases["baas:rest-db:restaurant"];

  // city is a location attribute; a non-place column stays text.
  assert.equal(db.properties.city.type, "place");
  assert.equal(db.properties.cuisine.type, "text");
  assert.equal(db.properties[LIVE_PLACE_PROPERTY_ID], undefined, "no derived __place — the city column IS the place");

  const viewTypes = Object.values(state.views).filter((view) => view.databaseId === db.id).map((view) => view.type);
  assert.ok(viewTypes.includes("map"), `expected a map view, got ${viewTypes.join(",")}`);

  // the row's place value is geocoded offline from the city name.
  const place = state.pages["baas:rest-db:restaurant:1"].properties.city as
    | { lat: number; lng: number; address: string }
    | null;
  assert.ok(place && typeof place.lat === "number", "place has numeric coords");
  assert.ok(Math.abs(place.lat - 44.84) < 0.2 && Math.abs(place.lng + 0.58) < 0.2, "Bordeaux centroid");
  assert.equal(place.address, "Bordeaux");
});

test("placeAddressFromRaw recovers the name from legacy {address}/JSON-stringified values", () => {
  assert.equal(placeAddressFromRaw("Bordeaux"), "Bordeaux"); // already clean
  assert.equal(placeAddressFromRaw({ address: "Reims" }), "Reims"); // object form
  assert.equal(placeAddressFromRaw('{"address":"Reims"}'), "Reims"); // legacy JSON-stringified
  assert.equal(placeAddressFromRaw('{"address":{"address":"Lyon"}}'), "Lyon"); // nested
  assert.equal(placeAddressFromRaw("161 Rua Keller, Geneva"), "161 Rua Keller, Geneva"); // plain address untouched
});

test("a legacy JSON-stringified place value decodes to the clean name + geocodes", () => {
  const cityCol = col("city");
  const decoded = decodeLiveValue('{"address":"Bordeaux"}', { id: "city", name: "City", type: "place" }, cityCol, REF) as
    { address: string; lat?: number };
  assert.equal(decoded.address, "Bordeaux"); // unwrapped, not the raw JSON
  assert.equal(typeof decoded.lat, "number"); // geocoded from the clean name
});

test("a place cell round-trips to the engine as the plain city NAME (editable, no coords written)", () => {
  const decoded = decodeLiveValue("Bordeaux", { id: "city", name: "City", type: "place" }, CITY_COL, REF) as
    { address: string; lat?: number };
  assert.equal(decoded.address, "Bordeaux");
  assert.equal(typeof decoded.lat, "number");
  // decoded object form AND the inline-editor `{address}` form both encode to the name.
  assert.equal(encodeLiveValue(decoded, { id: "city", name: "City", type: "place" }, CITY_COL), "Bordeaux");
  assert.equal(encodeLiveValue({ address: "Lyon" }, { id: "city", name: "City", type: "place" }, CITY_COL), "Lyon");
  // round-trip is stable (no phantom write on reload): decode→encode === the stored value.
  assert.equal(encodeLiveValue(decoded, { id: "city", name: "City", type: "place" }, CITY_COL), "Bordeaux");
});
