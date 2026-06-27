/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-view-presets.test.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { buildLiveState } from "../../src/shared/notion-database-sys/src/store/live/liveStateBuilder.ts";
import {
  LIVE_PLACE_PROPERTY_ID,
  registerLiveTablePresets,
} from "../../src/shared/notion-database-sys/src/store/live/liveViewPresets.ts";
import type { LiveSchemaResponse } from "../../src/shared/notion-database-sys/src/store/live/liveTypes.ts";

const col = (overrides: Record<string, unknown>) => ({
  native_type: "text",
  normalized_type: "text",
  nullable: true,
  default: null,
  enum_values: null,
  references: null,
  inferred: false,
  ...overrides,
});

const SCHEMA: LiveSchemaResponse = {
  dbId: "db-agency",
  engine: "postgresql",
  capabilities: { read: true, write: true },
  tables: [{
    name: "locations",
    primary_key: ["id"],
    columns: [
      col({ name: "id", native_type: "int4", normalized_type: "integer", nullable: false }),
      col({ name: "label" }),
      col({ name: "kind" }),
      col({ name: "lat", native_type: "float8", normalized_type: "float" }),
      col({ name: "lng", native_type: "float8", normalized_type: "float" }),
      col({ name: "address" }),
    ],
  } as LiveSchemaResponse["tables"][number]],
};

const ROWS = [
  { id: 1, label: "Safehouse", kind: "residence", lat: 48.85, lng: 2.35, address: "1 Rue X" },
  { id: 2, label: "Drop point", kind: "commercial", lat: 40.71, lng: -74.0, address: "2 Ave Y" },
  { id: 3, label: "No coords", kind: "residence", lat: null, lng: null, address: "" },
];

test("table preset upgrades select columns, derives place, adds curated views", () => {
  registerLiveTablePresets((ref) => (ref.table === "locations"
    ? {
        selectColumns: ["kind"],
        place: { lat: "lat", lng: "lng", address: "address" },
        views: (database) => [{
          id: `${database.id}#agency-map`,
          databaseId: database.id,
          name: "Map",
          type: "map",
          filters: [],
          filterConjunction: "and",
          sorts: [],
          visibleProperties: [],
          settings: { mapBy: LIVE_PLACE_PROPERTY_ID },
        }],
      }
    : null));
  try {
    const state = buildLiveState(SCHEMA, { dbId: "db-agency", table: "locations" }, { locations: ROWS });
    const database = state.databases["baas:db-agency:locations"];

    const kind = database.properties.kind;
    assert.equal(kind.type, "select");
    assert.deepEqual(kind.options?.map((option) => option.id), ["commercial", "residence"]);

    const place = database.properties[LIVE_PLACE_PROPERTY_ID];
    assert.equal(place?.type, "place");
    // The derived property is read-only on the wire — excluded from writes by the
    // diff's `__`-prefix skip (place-typed real columns ARE written, this is not).
    assert.ok(place?.id.startsWith("__"), "derived place id is __-prefixed (write-excluded)");

    const page = state.pages["baas:db-agency:locations:1"];
    assert.deepEqual(page.properties[LIVE_PLACE_PROPERTY_ID], { lat: 48.85, lng: 2.35, address: "1 Rue X" });
    assert.equal(state.pages["baas:db-agency:locations:3"].properties[LIVE_PLACE_PROPERTY_ID], null);

    const views = Object.values(state.views).filter((view) => view.databaseId === database.id);
    assert.deepEqual(views.map((view) => view.type).sort(), ["map", "table"]);
    assert.equal(views.find((view) => view.type === "map")?.settings.mapBy, LIVE_PLACE_PROPERTY_ID);
    // Curated views REPLACE the synthesized board (kind became a select).
    assert.equal(views.some((view) => view.id.endsWith("#board")), false);
  } finally {
    registerLiveTablePresets(null);
  }
});

test("without a preset, a lat/lng table auto-derives place + a map view", () => {
  const state = buildLiveState(SCHEMA, { dbId: "db-agency", table: "locations" }, { locations: ROWS });
  const database = state.databases["baas:db-agency:locations"];
  assert.equal(database.properties.kind.type, "text"); // non-place column untouched
  assert.equal(database.properties[LIVE_PLACE_PROPERTY_ID]?.type, "place"); // auto-detected from lat/lng
  const viewTypes = Object.values(state.views)
    .filter((view) => view.databaseId === database.id)
    .map((view) => view.type)
    .sort();
  assert.deepEqual(viewTypes, ["map", "table"]); // table + auto map (no select → no board)
});
