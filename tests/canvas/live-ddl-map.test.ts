/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   live-ddl-map.test.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/10 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/10 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import {
  ddlAddColumnRequest,
  ddlDropColumnRequest,
  ddlRetypeRequest,
  sanitizeLiveColumnName,
  schemaPropertyToDdlColumn,
} from "../../src/shared/notion-database-sys/src/store/live/liveDdlMapper.ts";

const prop = (type: string, name = "New Column", extra: Record<string, unknown> = {}) =>
  ({ id: "prop-abc123", name, type, ...extra }) as Parameters<typeof schemaPropertyToDdlColumn>[0];

test("select → enum with the option VALUES as enum_values", () => {
  const property = prop("select", "Priority", {
    options: [
      { id: "low", value: "low", color: "c" },
      { id: "high", value: "high", color: "c" },
    ],
  });
  assert.deepEqual(ddlAddColumnRequest("orders", property).request, {
    op: "add_column",
    table: "orders",
    column: { name: "priority", normalized_type: "enum", nullable: true, enum_values: ["low", "high"] },
  });
  // an optionless select has no honest enum shape
  assert.match(ddlAddColumnRequest("orders", prop("select", "Empty", { options: [] })).skipped ?? "", /at least one option/);
});

test("scalar type goldens: number→decimal, checkbox→boolean, date→datetime, multi_select→array, url→text", () => {
  const type = (property: Parameters<typeof schemaPropertyToDdlColumn>[0]) =>
    schemaPropertyToDdlColumn(property, "c").column?.normalized_type;
  assert.equal(type(prop("number")), "decimal"); // safe superset — never corrupts money columns
  assert.equal(type(prop("checkbox")), "boolean");
  assert.equal(type(prop("date")), "datetime"); // date-only would truncate UI times
  assert.equal(type(prop("multi_select")), "array");
  assert.equal(type(prop("url")), "text");
  assert.equal(type(prop("email")), "text");
  assert.equal(type(prop("text")), "text");
});

test("relation and exotic types are reported unsupported, never guessed", () => {
  assert.match(schemaPropertyToDdlColumn(prop("relation"), "c").unsupported ?? "", /out of scope/);
  assert.match(schemaPropertyToDdlColumn(prop("formula"), "c").unsupported ?? "", /no honest engine column/);
  assert.equal(ddlAddColumnRequest("orders", prop("relation")).request, undefined);
});

test("column names sanitize to engine-safe snake_case identifiers", () => {
  assert.equal(sanitizeLiveColumnName("New Column"), "new_column");
  assert.equal(sanitizeLiveColumnName("camelCaseName"), "camel_case_name");
  assert.equal(sanitizeLiveColumnName("Café crème!"), "caf_cr_me");
  assert.equal(sanitizeLiveColumnName("123abc"), null); // identifiers can't start with a digit
  assert.equal(sanitizeLiveColumnName("   "), null);
  // a digit-leading display name falls back to the property id
  const request = ddlAddColumnRequest("orders", prop("text", "123abc")).request as { column: { name: string } };
  assert.equal(request.column.name, "prop_abc123");
});

test("drop_column carries confirm:true (the UI menu action is the confirmation)", () => {
  assert.deepEqual(ddlDropColumnRequest("orders", "qty"), {
    op: "drop_column", table: "orders", column_name: "qty", confirm: true,
  });
});

test("alter_column_type sends the full target def, preserving unstated attributes", () => {
  const property = { id: "status", name: "Status", type: "text" } as Parameters<typeof ddlRetypeRequest>[1];
  assert.deepEqual(ddlRetypeRequest("orders", property).request, {
    op: "alter_column_type",
    table: "orders",
    column: { name: "status", normalized_type: "text" }, // no nullable → service keeps current
  });
  assert.match(ddlRetypeRequest("orders", { ...property, type: "relation" } as never).skipped ?? "", /out of scope/);
});
