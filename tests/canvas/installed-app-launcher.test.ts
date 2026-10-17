import assert from "node:assert/strict";
import test from "node:test";

import {
  BUILT_IN_APP_IDENTIFIERS,
  railInstalledApps,
  STATIC_APP_IDENTIFIERS,
} from "../../src/features/marketplace/model/installedAppLauncher.ts";
import type { InstalledEntry, InstalledMap } from "../../src/features/marketplace/model/useInstalledApps.ts";

function entry(identifier: string, active = true): InstalledEntry {
  return {
    identifier,
    title: identifier,
    launchKind: "embed",
    launchUrl: "https://localhost:3007",
    autoUpdate: false,
    active,
    installedAt: "2026-10-17T00:00:00Z",
  };
}

function mapOf(...entries: InstalledEntry[]): InstalledMap {
  return Object.fromEntries(entries.map((installed) => [installed.identifier, installed]));
}

test("built-in apps are the whiteboard and its retired Draw identifier", () => {
  assert.deepEqual([...BUILT_IN_APP_IDENTIFIERS].sort(), ["osionos.draw", "osionos.whiteboard"]);
});

test("every built-in app is also static: one set derives from the other", () => {
  for (const identifier of BUILT_IN_APP_IDENTIFIERS) assert.ok(STATIC_APP_IDENTIFIERS.has(identifier), identifier);
  assert.ok(STATIC_APP_IDENTIFIERS.has("osionos.mail"));
  assert.ok(STATIC_APP_IDENTIFIERS.has("osionos.calendar"));
});

test("an installed osionos.whiteboard or osionos.draw adds no second rail icon", () => {
  const installed = mapOf(entry("osionos.whiteboard"), entry("osionos.draw"), entry("osionos.mail"), entry("osionos.calendar"));
  assert.deepEqual(railInstalledApps(installed), []);
});

test("other active installed apps still reach the rail, deactivated ones do not", () => {
  const installed = mapOf(entry("acme.crm"), entry("acme.off", false), entry("osionos.whiteboard"));
  assert.deepEqual(railInstalledApps(installed).map((app) => app.identifier), ["acme.crm"]);
});

test("an empty installed map yields an empty list", () => {
  assert.deepEqual(railInstalledApps({}), []);
});
