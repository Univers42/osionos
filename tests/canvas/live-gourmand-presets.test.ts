/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-gourmand-presets.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Vite & Gourmand client pack: PascalCase Prisma table names ("Order",
 * "UserAddress") must resolve presets, the TEXT status column must surface
 * select lanes (synthesized from observed rows), the delivery map must
 * derive `__place` from Decimal-as-string lat/lng, and curated views must
 * materialize through buildLiveState.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildLiveState } from "../../src/shared/notion-database-sys/src/store/live/liveStateBuilder.ts";
import {
  LIVE_PLACE_PROPERTY_ID,
  registerLiveTablePresets,
} from "../../src/shared/notion-database-sys/src/store/live/liveViewPresets.ts";
import type { LiveSchemaResponse } from "../../src/shared/notion-database-sys/src/store/live/liveTypes.ts";

const col = (name: string, normalized_type: string, extra: Record<string, unknown> = {}) => ({
  name, native_type: normalized_type, normalized_type, nullable: true,
  default: null, enum_values: null, references: null, inferred: false, ...extra,
});

test("gourmand pack: PascalCase tables get lanes, map and curated views", async () => {
  registerLiveTablePresets(null);
  await import("../../src/widgets/database-view/model/gourmandViewPresets.ts");

  const orderSchema: LiveSchemaResponse = {
    dbId: "db-vg", engine: "postgresql", capabilities: { read: true, write: true },
    tables: [{
      name: "Order",
      primary_key: ["id"],
      columns: [
        col("id", "integer", { nullable: false }),
        col("order_number", "text"), col("status", "text"),
        col("delivery_city", "text"), col("delivery_date", "datetime"),
        col("menu_price", "decimal"),
      ],
    } as LiveSchemaResponse["tables"][number]],
  };
  const rows = [
    { id: 1, order_number: "VG-001", status: "pending", delivery_city: "Bordeaux", menu_price: "120.00" },
    { id: 2, order_number: "VG-002", status: "confirmed", delivery_city: "Bordeaux", menu_price: "85.50" },
    { id: 3, order_number: "VG-003", status: "delivered", delivery_city: "Pessac", menu_price: "240.00" },
  ];
  const state = buildLiveState(orderSchema, { dbId: "db-vg", table: "Order" }, { Order: rows });
  const database = state.databases["baas:db-vg:Order"];
  assert.ok(database, "PascalCase live id resolves");
  // TEXT status upgraded to select with the observed values as options.
  assert.equal(database.properties.status.type, "select");
  const optionValues = (database.properties.status.options ?? []).map((option) => option.value).sort();
  assert.deepEqual(optionValues, ["confirmed", "delivered", "pending"]);
  const views = new Map(Object.values(state.views)
    .filter((view) => view.databaseId === "baas:db-vg:Order")
    .map((view) => [view.name, view]));
  assert.equal(views.get("Order Pipeline")?.grouping?.propertyId, "status");
  assert.equal(views.get("Delivery Calendar")?.settings.showCalendarBy, "delivery_date");
  assert.ok((views.get("Revenue")?.settings.widgets?.length ?? 0) >= 5);

  const addressSchema: LiveSchemaResponse = {
    dbId: "db-vg", engine: "postgresql", capabilities: { read: true, write: true },
    tables: [{
      name: "UserAddress",
      primary_key: ["id"],
      columns: [
        col("id", "integer", { nullable: false }),
        col("street_address", "text"), col("city", "text"),
        col("latitude", "decimal"), col("longitude", "decimal"),
      ],
    } as LiveSchemaResponse["tables"][number]],
  };
  const addressState = buildLiveState(
    addressSchema,
    { dbId: "db-vg", table: "UserAddress" },
    { UserAddress: [{ id: 7, street_address: "12 rue Ste-Catherine", city: "Bordeaux", latitude: "44.84120000", longitude: "-0.57210000" }] },
  );
  const addressDb = addressState.databases["baas:db-vg:UserAddress"];
  assert.equal(addressDb.properties[LIVE_PLACE_PROPERTY_ID]?.type, "place", "derived map property");
  const page = addressState.pages["baas:db-vg:UserAddress:7"];
  const place = page.properties[LIVE_PLACE_PROPERTY_ID] as { lat: number; lng: number } | null;
  assert.ok(place && Math.abs(place.lat - 44.8412) < 1e-6, "Decimal-as-string lat decoded");
  const mapView = Object.values(addressState.views)
    .find((view) => view.databaseId === "baas:db-vg:UserAddress" && view.type === "map");
  assert.equal(mapView?.settings.mapBy, LIVE_PLACE_PROPERTY_ID);
  registerLiveTablePresets(null);
});
