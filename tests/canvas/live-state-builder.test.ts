/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-state-builder.test.ts                         :+:      :+:    :+:   */
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
  buildLiveState,
  LIVE_EPOCH_ISO,
} from "../../src/shared/notion-database-sys/src/store/live/liveStateBuilder.ts";
import type { LiveSchemaResponse } from "../../src/shared/notion-database-sys/src/store/live/liveTypes.ts";

// Handwritten fixture matching the GET /query/v1/:dbId/schema wire contract.
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
  dbId: "db-1",
  engine: "postgresql",
  capabilities: { read: true, write: true, aggregate: true },
  tables: [
    {
      name: "orders",
      primary_key: ["id"],
      columns: [
        col({ name: "id", native_type: "uuid", normalized_type: "uuid", nullable: false }),
        col({ name: "label", normalized_type: "text", nullable: false }),
        col({
          name: "status",
          native_type: "order_status",
          normalized_type: "enum",
          enum_values: ["pending", "paid"],
        }),
        col({
          name: "customer_id",
          native_type: "uuid",
          normalized_type: "uuid",
          references: { table: "customers", column: "id" },
        }),
        col({ name: "created_at", native_type: "timestamptz", normalized_type: "datetime" }),
        col({ name: "owner_id", native_type: "uuid", normalized_type: "uuid" }),
      ],
    } as LiveSchemaResponse["tables"][number],
    {
      name: "customers",
      primary_key: ["id"],
      columns: [
        col({ name: "id", native_type: "uuid", normalized_type: "uuid", nullable: false }),
        col({ name: "name", normalized_type: "text", nullable: false }),
        col({ name: "owner_id", native_type: "uuid", normalized_type: "uuid" }),
      ],
    } as LiveSchemaResponse["tables"][number],
    {
      name: "unrelated",
      primary_key: ["id"],
      columns: [col({ name: "id", normalized_type: "integer", nullable: false })],
    } as LiveSchemaResponse["tables"][number],
  ],
};

const ROWS = {
  orders: [
    {
      id: "o-1",
      label: "First order",
      status: "paid",
      customer_id: "c-9",
      created_at: "2026-06-01T08:00:00.000Z",
      owner_id: "u-1",
    },
    { id: "o-2", label: "Second order", status: "pending", customer_id: null, owner_id: "u-1" },
  ],
};

test("state: primary table with rows + relation target schema-only", () => {
  const state = buildLiveState(SCHEMA, { dbId: "db-1", table: "orders" }, ROWS);

  assert.ok(state.databases["baas:db-1:orders"], "primary database present");
  assert.ok(state.databases["baas:db-1:customers"], "relation target present (schema-only)");
  assert.equal(state.databases["baas:db-1:unrelated"], undefined, "unreferenced table excluded");
  assert.equal(state.databases["baas:db-1:orders"].name, "Orders");
  assert.equal(state.databases["baas:db-1:orders"].titlePropertyId, "label");
  assert.equal(state.databases["baas:db-1:orders"].properties.owner_id, undefined);

  assert.equal(Object.keys(state.pages).length, 2, "only the primary table has rows");
  const first = state.pages["baas:db-1:orders:o-1"];
  assert.ok(first, "page keyed by live page id");
  assert.equal(first.databaseId, "baas:db-1:orders");
  assert.equal(first.properties.label, "First order");
  assert.equal(first.properties.status, "paid");
  assert.deepEqual(first.properties.customer_id, ["baas:db-1:customers:c-9"]);
  assert.equal(first.createdAt, "2026-06-01T08:00:00.000Z");

  const second = state.pages["baas:db-1:orders:o-2"];
  assert.deepEqual(second.properties.customer_id, []);
  assert.equal(second.createdAt, LIVE_EPOCH_ISO); // deterministic fallback
});

test("views: default table view per database + board on the enum column", () => {
  const state = buildLiveState(SCHEMA, { dbId: "db-1", table: "orders" }, ROWS);

  const ordersTable = state.views["baas:db-1:orders#table"];
  assert.ok(ordersTable, "orders table view");
  assert.equal(ordersTable.type, "table");
  assert.equal(ordersTable.databaseId, "baas:db-1:orders");
  assert.ok(!ordersTable.visibleProperties.includes("label"), "title not duplicated");
  assert.ok(!ordersTable.visibleProperties.includes("owner_id"));

  const ordersBoard = state.views["baas:db-1:orders#board"];
  assert.ok(ordersBoard, "board exists because status is an enum");
  assert.equal(ordersBoard.type, "board");
  assert.equal(ordersBoard.grouping?.propertyId, "status");

  assert.ok(state.views["baas:db-1:customers#table"], "relation target table view");
  assert.equal(state.views["baas:db-1:customers#board"], undefined, "no enum → no board");
});

test("composite pk rows join with ':' and parse back as one pk", () => {
  const schema: LiveSchemaResponse = {
    dbId: "db-1",
    engine: "postgresql",
    capabilities: null,
    tables: [{
      name: "order_items",
      primary_key: ["order_id", "line_no"],
      columns: [
        col({ name: "order_id", normalized_type: "uuid", nullable: false }),
        col({ name: "line_no", normalized_type: "integer", nullable: false }),
        col({ name: "sku", normalized_type: "text" }),
      ],
    } as LiveSchemaResponse["tables"][number]],
  };
  const state = buildLiveState(
    schema,
    { dbId: "db-1", table: "order_items" },
    { order_items: [{ order_id: "o-1", line_no: 3, sku: "SKU-9" }] },
  );
  assert.ok(state.pages["baas:db-1:order_items:o-1:3"], "composite pk joined with ':'");
});
