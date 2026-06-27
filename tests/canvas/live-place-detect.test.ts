/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-place-detect.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { detectPlaceSource } from "../../src/shared/notion-database-sys/src/store/live/liveViewPresets.ts";
import { geocodePlaceColumn, isPlaceNameColumn } from "../../src/shared/notion-database-sys/src/store/live/placeColumns.ts";
import { cityCentroid } from "../../src/shared/notion-database-sys/src/store/live/cityCentroids.ts";
import { countryCentroid } from "../../src/shared/notion-database-sys/src/store/live/countryCentroids.ts";
import { regionCentroid } from "../../src/shared/notion-database-sys/src/store/live/regionCentroids.ts";

test("detectPlaceSource is the DERIVED lat/lng source only (single-column places are typed directly)", () => {
  assert.deepEqual(detectPlaceSource(["id", "latitude", "longitude", "name"]), { lat: "latitude", lng: "longitude" });
  assert.deepEqual(detectPlaceSource(["lat", "lng", "city"]), { lat: "lat", lng: "lng", address: "city" });
  assert.deepEqual(detectPlaceSource(["pickup_lat", "pickup_long"]), { lat: "pickup_lat", lng: "pickup_long" });
  // a standalone city/country has no coordinate PAIR → not a derived source.
  assert.equal(detectPlaceSource(["id", "city", "country"]), null);
});

test("isPlaceNameColumn flags location-named columns, not plain data or status", () => {
  for (const name of ["city", "country", "region", "province", "location", "place", "delivery_city", "origin_country"]) {
    assert.ok(isPlaceNameColumn(name), `expected ${name} to be place-like`);
  }
  for (const name of ["id", "name", "total", "status", "state", "cuisine", "price"]) {
    assert.ok(!isPlaceNameColumn(name), `expected ${name} NOT to be place-like`);
  }
});

test("geocodePlaceColumn routes city/country/region to the right offline table", () => {
  assert.ok(geocodePlaceColumn("city", "Bordeaux"));
  assert.ok(geocodePlaceColumn("country", "France"));
  assert.ok(geocodePlaceColumn("region", "APAC"));
  assert.equal(geocodePlaceColumn("city", "Nowhereville"), null);
});

test("an address column extracts a known city from its text (else stays markerless)", () => {
  assert.ok(geocodePlaceColumn("address", "161 Rua Keller, Geneva, CH"), "extracts Geneva");
  assert.ok(geocodePlaceColumn("address", "5th Ave, New York"), "matches multi-word city");
  assert.equal(geocodePlaceColumn("address", "161 Rua Keller"), null); // street only → no marker, honest
});

test("centroid tables resolve the demo values (case-insensitive), null for unknown", () => {
  for (const c of ["Bordeaux", "Marseille", "Paris", "Taipei", "Recife", "amsterdam"]) assert.ok(cityCentroid(c), c);
  for (const c of ["France", "fr", "CH", "BE", "USA"]) assert.ok(countryCentroid(c), c);
  for (const r of ["APAC", "EU", "LATAM"]) assert.ok(regionCentroid(r), r);
  assert.equal(cityCentroid("Nowhereville"), null);
  assert.equal(countryCentroid(42), null);
  assert.equal(regionCentroid(null), null);
});
