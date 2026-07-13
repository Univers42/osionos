/* ************************************************************************** */
/*  database-properties-normalize.test.ts                                     */
/*  Regression: Sort/Filter open crashed on Object.values(db.properties)      */
/*  when a loaded/older-schema database reached the store with no properties  */
/*  map. normalizeDatabases backfills it at the ingestion boundary.           */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDatabases } from "../../src/shared/notion-database-sys/src/store/sources/normalizeDatabases.ts";
import type { DatabaseSchema } from "../../src/shared/notion-database-sys/src/component/types.ts";

/** A well-formed schema (the happy path a fresh/seeded database has). */
function validDb(id: string): DatabaseSchema {
  const titleId = `${id}-title`;
  return {
    id, name: id, titlePropertyId: titleId,
    properties: { [titleId]: { id: titleId, name: "Name", type: "title" } },
  };
}

/** The exact malformed shape that crashed the panels: a database loaded from
 *  older/persisted state with NO properties map. Cast because the contract
 *  type declares properties required (which is why tsc never caught it). */
function malformedDb(id: string): DatabaseSchema {
  return { id, name: id, titlePropertyId: `${id}-title` } as unknown as DatabaseSchema;
}

test("normalizeDatabases backfills a missing properties map to {}", () => {
  const out = normalizeDatabases({ bad: malformedDb("bad") });
  assert.deepEqual(out.bad.properties, {});
  // The panels' crash site (Object.values(db.properties)) is now safe.
  assert.doesNotThrow(() => Object.values(out.bad.properties));
});

test("normalizeDatabases leaves a valid map untouched (same refs, no store churn)", () => {
  const input = { ok: validDb("ok") };
  const out = normalizeDatabases(input);
  assert.equal(out, input);       // same top-level ref → no needless re-render
  assert.equal(out.ok, input.ok); // same database ref
});

test("normalizeDatabases rewrites only the malformed entries", () => {
  const good = validDb("good");
  const out = normalizeDatabases({ good, bad: malformedDb("bad") });
  assert.equal(out.good, good);            // untouched entry keeps its ref
  assert.deepEqual(out.bad.properties, {}); // malformed entry repaired
});

test("normalizeDatabases treats an empty {} properties as already valid", () => {
  const input = { e: { ...validDb("e"), properties: {} } as DatabaseSchema };
  assert.equal(normalizeDatabases(input), input); // {} is truthy → no rewrite
});
