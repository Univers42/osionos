import assert from "node:assert/strict";
import test from "node:test";

import type { SchemaProperty } from "@/shared/notion-database-sys/src/types/database";
import { statEntries } from "@/shared/notion-database-sys/src/components/views/dashboard/notion/model/statEntries.ts";

const PROPERTIES: Record<string, SchemaProperty> = {
  "pp-price": { id: "pp-price", name: "Price", type: "number" },
  "pp-stock": { id: "pp-stock", name: "Stock", type: "number" },
  "pp-featured": { id: "pp-featured", name: "Featured", type: "checkbox" },
  "pp-category": { id: "pp-category", name: "Category", type: "select" },
};

test("stat entries include every picker option", () => {
  const entries = statEntries(PROPERTIES);
  const labels = entries.map((entry) => entry.label);
  assert.ok(labels.includes("Count of records"));
  assert.ok(labels.includes("Count where Featured is checked"));
  assert.ok(labels.includes("Count where Featured is not checked"));
  assert.ok(labels.includes("Distinct Category"));
  assert.ok(labels.includes("Min of Price"));
  assert.ok(labels.includes("Max of Stock"));
  assert.ok(labels.includes("Average Stock"));
});

test("a list of columns gives the same entries as the schema record", () => {
  assert.deepEqual(statEntries(Object.values(PROPERTIES)), statEntries(PROPERTIES));
});
