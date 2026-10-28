// The client validator answers exactly what scripts/bridge-member-attributes.mjs answers,
// on both sides of every bound, so the People editor and the share picker never claim a
// value the server would refuse.

import assert from "node:assert/strict";
import test from "node:test";

const client = await import("../../src/shared/lib/memberAttribute.ts");
const bridge = await import("../../scripts/bridge-member-attributes.mjs");

function bridgeAnswer(fn: (input: unknown) => unknown, input: unknown): string | null {
  try { fn(input); return null; } catch (error) { return (error as Error).message; }
}

const NAMES = ["a", "team", "cost_center2", "a".repeat(32), "", "A", "1team", "team-x", "a".repeat(33), "té", null];
const VALUES = ["x", "Paris", "v".repeat(64), "", "v".repeat(65), "a:b", " lead", "lead ", "a\tb", "a\u007fb", "ok value", null];

test("validateName agrees with the bridge on every name", () => {
  for (const name of NAMES) assert.equal(client.validateName(name), bridgeAnswer(bridge.validateName, name), String(name));
});

test("validateValue agrees with the bridge on every value", () => {
  for (const value of VALUES) assert.equal(client.validateValue(value), bridgeAnswer(bridge.validateValue, value), JSON.stringify(value));
});

test("bounds: 32-char name and 64-char value pass, one more fails", () => {
  assert.equal(client.validateName("a".repeat(32)), null);
  assert.notEqual(client.validateName("a".repeat(33)), null);
  assert.equal(client.validateValue("v".repeat(64)), null);
  assert.notEqual(client.validateValue("v".repeat(65)), null);
});

const { entriesFromRules, entryKey } = await import("../../src/features/share/shareModel.helpers.ts");
const { toAccessRule } = await import("../../src/features/share/sharePermissionBridge.ts");

test("an attribute share rule round-trips: rule → entry → rule", () => {
  const resource = { workspaceId: "ws1", resourceId: "p1", resourceType: "page" as const };
  const rule = { ...resource, _id: "r1", target: { type: "attribute" as const, name: "office", value: "Paris" }, permission: "can_view" as const, explicit: true };
  const [entry] = entriesFromRules([rule], []);
  assert.equal(entry.key, "attribute:office:Paris");
  assert.equal(entryKey(entry.target), entry.key);
  assert.deepEqual(toAccessRule(resource, entry), rule);
});

test("an attribute rule missing its name or value shows no row", () => {
  const rule = { _id: "r2", workspaceId: "ws1", resourceId: "p1", resourceType: "page" as const, target: { type: "attribute", name: "office" } as never, permission: "can_view" as const, explicit: true };
  assert.deepEqual(entriesFromRules([rule], []), []);
});
