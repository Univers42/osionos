/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-commerce-presets.test.ts                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The composable preset registry + the commerce/ops/activity packs: multiple
 * packs must coexist (the registry was last-write-wins, so loading a second
 * pack silently killed the first), and the curated views must materialize on
 * a live-shaped schema through buildLiveState.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { buildLiveState } from "../../src/shared/notion-database-sys/src/store/live/liveStateBuilder.ts";
import {
  registerLiveTablePresets,
  resolveLiveTablePreset,
} from "../../src/shared/notion-database-sys/src/store/live/liveViewPresets.ts";
import type { LiveSchemaResponse } from "../../src/shared/notion-database-sys/src/store/live/liveTypes.ts";

const col = (name: string, normalized_type: string, extra: Record<string, unknown> = {}) => ({
  name, native_type: normalized_type, normalized_type, nullable: true,
  default: null, enum_values: null, references: null, inferred: false, ...extra,
});

test("registry: independent packs coexist, first non-null preset wins", () => {
  registerLiveTablePresets(null); // clean slate
  const packA = (ref: { table: string }) => (ref.table === "cases" ? { selectColumns: ["status"] } : null);
  const packB = (ref: { table: string }) => (ref.table === "orders" ? { selectColumns: ["city"] } : null);
  registerLiveTablePresets(packA);
  registerLiveTablePresets(packB);
  registerLiveTablePresets(packB); // re-register = no-op, not a duplicate
  assert.deepEqual(resolveLiveTablePreset({ dbId: "x", table: "cases" })?.selectColumns, ["status"]);
  assert.deepEqual(resolveLiveTablePreset({ dbId: "x", table: "orders" })?.selectColumns, ["city"]);
  assert.equal(resolveLiveTablePreset({ dbId: "x", table: "unknown" }), null);
  // A throwing pack must not take the others down.
  registerLiveTablePresets(() => { throw new Error("broken pack"); });
  assert.deepEqual(resolveLiveTablePreset({ dbId: "x", table: "cases" })?.selectColumns, ["status"]);
  registerLiveTablePresets(null);
});

test("commerce + ops packs: curated views materialize through buildLiveState", async () => {
  registerLiveTablePresets(null);
  // Side-effect imports register both packs (same path the app takes).
  await import("../../src/widgets/database-view/model/commerceViewPresets.ts");
  await import("../../src/widgets/database-view/model/opsActivityViewPresets.ts");

  const schema: LiveSchemaResponse = {
    dbId: "db-c", engine: "postgresql", capabilities: { read: true, write: true },
    tables: [{
      name: "orders",
      primary_key: ["id"],
      columns: [
        col("id", "integer", { nullable: false }),
        col("status", "enum", { enum_values: ["pending", "delivered"] }),
        col("ship_method", "enum", { enum_values: ["standard", "express"] }),
        col("placed_at", "datetime"), col("shipped_at", "datetime"),
        col("total", "decimal"), col("notes", "text"),
      ],
    } as LiveSchemaResponse["tables"][number]],
  };
  const state = buildLiveState(schema, { dbId: "db-c", table: "orders" }, { orders: [] });
  const views = Object.values(state.views).filter((view) => view.databaseId === "baas:db-c:orders");
  const byName = new Map(views.map((view) => [view.name, view]));
  assert.ok(byName.has("Pipeline"), "commerce board");
  assert.equal(byName.get("Pipeline")?.grouping?.propertyId, "status");
  assert.equal(byName.get("Fulfillment")?.type, "timeline");
  assert.equal(byName.get("Fulfillment")?.settings.showTimelineBy, "placed_at");
  assert.equal(byName.get("Revenue by Status")?.settings.yAxisAggregation, "sum");
  assert.ok((byName.get("Store Stats")?.settings.widgets?.length ?? 0) >= 5, "dashboard widgets");

  const tasksSchema: LiveSchemaResponse = {
    dbId: "db-o", engine: "mysql", capabilities: { read: true, write: true },
    tables: [{
      name: "tasks",
      primary_key: ["id"],
      columns: [
        col("id", "integer", { nullable: false }),
        col("title", "text"), col("priority", "enum", { enum_values: ["low", "high"] }),
        col("due_on", "date"), col("estimate_h", "decimal"),
        col("status", "enum", { enum_values: ["todo", "done"] }),
      ],
    } as LiveSchemaResponse["tables"][number]],
  };
  const ops = buildLiveState(tasksSchema, { dbId: "db-o", table: "tasks" }, { tasks: [] });
  const opsViews = new Map(Object.values(ops.views)
    .filter((view) => view.databaseId === "baas:db-o:tasks")
    .map((view) => [view.name, view]));
  assert.equal(opsViews.get("Due Calendar")?.type, "calendar");
  assert.equal(opsViews.get("Due Calendar")?.settings.showCalendarBy, "due_on");
  assert.equal(opsViews.get("Workload")?.settings.yAxisProperty, "estimate_h");
  registerLiveTablePresets(null);
});
