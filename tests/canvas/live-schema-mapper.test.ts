/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-schema-mapper.test.ts                         :+:      :+:    :+:   */
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
  humanizeName,
  mapLiveTable,
  pickTitleColumn,
} from "../../src/shared/notion-database-sys/src/store/live/liveSchemaMapper.ts";
import type { LiveTableSchema } from "../../src/shared/notion-database-sys/src/store/live/liveTypes.ts";

// Handwritten fixtures matching the wire contract of GET /query/v1/:dbId/schema
// (data-plane-core schema.rs round-trip test shapes — no invented fields).
const col = (overrides: Record<string, unknown>) => ({
  native_type: "text",
  normalized_type: "text",
  nullable: true,
  default: null,
  enum_values: null,
  references: null,
  inferred: false,
  ...overrides,
}) as LiveTableSchema["columns"][number];

const PG_ORDERS: LiveTableSchema = {
  name: "orders",
  primary_key: ["id"],
  columns: [
    col({ name: "id", native_type: "uuid", normalized_type: "uuid", nullable: false }),
    col({ name: "label", native_type: "varchar(255)", normalized_type: "text", nullable: false }),
    col({
      name: "status",
      native_type: "order_status",
      normalized_type: "enum",
      nullable: false,
      enum_values: ["pending", "paid", "shipped", "cancelled"],
    }),
    col({
      name: "customer_id",
      native_type: "uuid",
      normalized_type: "uuid",
      references: { table: "customers", column: "id" },
    }),
    col({ name: "total", native_type: "numeric(10,2)", normalized_type: "decimal" }),
    col({ name: "paid", native_type: "boolean", normalized_type: "boolean" }),
    col({ name: "created_at", native_type: "timestamptz", normalized_type: "datetime" }),
    col({ name: "metadata", native_type: "jsonb", normalized_type: "json" }),
    col({ name: "owner_id", native_type: "uuid", normalized_type: "uuid", nullable: false }),
  ],
};

const MONGO_PRODUCTS: LiveTableSchema = {
  name: "products",
  primary_key: ["_id"],
  columns: [
    col({ name: "_id", native_type: "objectId", normalized_type: "objectid", nullable: false }),
    col({ name: "name", native_type: "string", normalized_type: "text", inferred: true }),
    col({ name: "qty", native_type: "int", normalized_type: "integer", inferred: true }),
    col({ name: "tenant_id", native_type: "string", normalized_type: "text", inferred: true }),
  ],
};

test("pg golden: title pick, enum→select, FK→relation, plumbing excluded", () => {
  const { properties, titlePropertyId } = mapLiveTable(PG_ORDERS, "db-1");

  assert.equal(titlePropertyId, "label"); // first title-named column (label)
  assert.equal(properties.label.type, "title");
  assert.equal(properties.owner_id, undefined); // platform plumbing hidden
  assert.equal(properties.id.type, "text"); // uuid → text
  assert.equal(properties.total.type, "number");
  assert.equal(properties.paid.type, "checkbox");
  assert.equal(properties.created_at.type, "date");
  assert.equal(properties.metadata.type, "id"); // json → read-only presentation

  const status = properties.status;
  assert.equal(status.type, "select");
  assert.deepEqual(status.options?.map((o) => o.id), ["pending", "paid", "shipped", "cancelled"]);
  assert.ok(status.options?.every((o) => o.id === o.value)); // stable ids = values

  const relation = properties.customer_id;
  assert.equal(relation.type, "relation");
  assert.equal(relation.relationConfig?.databaseId, "baas:db-1:customers");
  assert.equal(relation.relationConfig?.type, "one_way");

  // property ids are the column names (deterministic)
  assert.ok(Object.values(properties).every((property) => property.id in properties));
});

test("mongo golden: _id pk, inferred columns read-only, tenant_id excluded", () => {
  const { properties, titlePropertyId } = mapLiveTable(MONGO_PRODUCTS, "db-2");

  assert.equal(titlePropertyId, "name"); // named match wins even when inferred
  assert.equal(properties.name.type, "title");
  assert.equal(properties.tenant_id, undefined); // mongo plumbing hidden
  assert.equal(properties._id.type, "id"); // objectid → read-only presentation
  assert.equal(properties.qty.type, "id"); // inferred → read-only presentation
});

test("title fallback: first text column, else the primary key", () => {
  const noNamed: LiveTableSchema = {
    name: "events",
    primary_key: ["id"],
    columns: [
      col({ name: "id", native_type: "bigint", normalized_type: "integer", nullable: false }),
      col({ name: "payload", native_type: "text", normalized_type: "text" }),
    ],
  };
  assert.equal(pickTitleColumn(noNamed), "payload");

  const pkOnly: LiveTableSchema = {
    name: "counters",
    primary_key: ["id"],
    columns: [
      col({ name: "id", native_type: "bigint", normalized_type: "integer", nullable: false }),
      col({ name: "value", native_type: "bigint", normalized_type: "integer" }),
    ],
  };
  assert.equal(pickTitleColumn(pkOnly), "id");
  const mapped = mapLiveTable(pkOnly, "db-3");
  assert.equal(mapped.properties.id.type, "title"); // pk string-rendered as title
});

test("humanizeName: snake/kebab/camel → Title Case", () => {
  assert.equal(humanizeName("order_items"), "Order Items");
  assert.equal(humanizeName("created-at"), "Created At");
  assert.equal(humanizeName("customerId"), "Customer Id");
});
