/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-reference-infer.test.ts                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { inferLiveReferences } from "../../src/shared/notion-database-sys/src/store/live/liveReferenceInfer.ts";
import type {
  LiveColumnSchema,
  LiveSchemaResponse,
} from "../../src/shared/notion-database-sys/src/store/live/liveTypes.ts";

function col(name: string, over: Partial<LiveColumnSchema> = {}): LiveColumnSchema {
  return { name, native_type: "text", normalized_type: "text", nullable: true, default: null, enum_values: null, references: null, inferred: false, ...over };
}
function schema(tables: { name: string; pk?: string[]; columns: LiveColumnSchema[] }[]): LiveSchemaResponse {
  return { dbId: "d", engine: "dynamodb", capabilities: null, tables: tables.map((t) => ({ name: t.name, primary_key: t.pk ?? ["id"], columns: t.columns })) };
}
const find = (s: LiveSchemaResponse, table: string, column: string) =>
  s.tables.find((t) => t.name === table)?.columns.find((c) => c.name === column);

test("infers <base>_id and <base>_ref to a sibling table (singular + plural)", () => {
  const out = inferLiveReferences(schema([
    { name: "devices", columns: [col("id"), col("product_ref")] },
    { name: "device_events", columns: [col("id"), col("device_ref"), col("metric")] },
    { name: "menu", columns: [col("id")] },
    { name: "dish", columns: [col("id"), col("menu_id")] },
  ]));
  assert.deepEqual(find(out, "device_events", "device_ref")?.references, { table: "devices", column: "id" });
  assert.deepEqual(find(out, "dish", "menu_id")?.references, { table: "menu", column: "id" });
  // product_ref has no `product`/`products` table here → stays unresolved.
  assert.equal(find(out, "devices", "product_ref")?.references, null);
});

test("never infers ownership/tenancy stamps", () => {
  const out = inferLiveReferences(schema([
    { name: "owner_id", columns: [col("id")] },
    { name: "tenant_id", columns: [col("id")] },
    { name: "rows", columns: [col("id"), col("owner_id"), col("tenant_id")] },
  ]));
  assert.equal(find(out, "rows", "owner_id")?.references, null);
  assert.equal(find(out, "rows", "tenant_id")?.references, null);
});

test("keeps a real FK reference and never self-references", () => {
  const real = { table: "customers", column: "id" };
  const out = inferLiveReferences(schema([
    { name: "customers", columns: [col("id")] },
    { name: "orders", columns: [col("id"), col("customer_id", { references: real }), col("order_id")] },
  ]));
  assert.deepEqual(find(out, "orders", "customer_id")?.references, real, "real FK preserved");
  // order_id would resolve to `orders` (own table) → skipped.
  assert.equal(find(out, "orders", "order_id")?.references, null);
});

test("returns the SAME object when nothing is inferred (no churn)", () => {
  const input = schema([{ name: "t", columns: [col("id"), col("name")] }]);
  assert.equal(inferLiveReferences(input), input);
});

test("infers a CROSS-MOUNT reference when exactly one other mount owns the table", () => {
  const s = schema([{ name: "devices", columns: [col("id"), col("product_ref")] }]);
  const out = inferLiveReferences(s, "iot-db", [
    { dbId: "iot-db", tables: ["devices"] }, // own mount (filtered out)
    { dbId: "commerce-db", tables: ["products", "orders"] },
  ]);
  assert.deepEqual(find(out, "devices", "product_ref")?.references, {
    table: "products",
    column: "id",
    dbId: "commerce-db",
  });
});

test("does NOT cross-mount-infer when ambiguous (two other mounts own it)", () => {
  const s = schema([{ name: "devices", columns: [col("id"), col("product_ref")] }]);
  const out = inferLiveReferences(s, "iot-db", [
    { dbId: "a", tables: ["products"] },
    { dbId: "b", tables: ["products"] },
  ]);
  assert.equal(find(out, "devices", "product_ref")?.references, null);
});

test("same-mount target wins over a cross-mount candidate (no dbId)", () => {
  const s = schema([
    { name: "devices", columns: [col("id"), col("product_ref")] },
    { name: "products", columns: [col("id")] },
  ]);
  const out = inferLiveReferences(s, "iot-db", [{ dbId: "commerce-db", tables: ["products"] }]);
  assert.deepEqual(find(out, "devices", "product_ref")?.references, { table: "products", column: "id" });
});
