import assert from "node:assert/strict";
import test from "node:test";

import { migrateInstalledMap } from "../../src/features/marketplace/model/installedMigrations.ts";
import type { InstalledMap } from "../../src/features/marketplace/model/useInstalledApps.ts";

const draw = {
  identifier: "osionos.draw",
  title: "Draw",
  icon: "icon:old",
  launchKind: "panel",
  launchUrl: "https://localhost:3001",
  autoUpdate: false,
  active: false,
  installedAt: "2026-06-01T00:00:00Z",
} as const;

const mail = { ...draw, identifier: "osionos.mail", title: "Mail" };

test("an installed Draw becomes Whiteboard and keeps the user's choices", () => {
  const { map, changed } = migrateInstalledMap({ "osionos.draw": draw, "osionos.mail": mail } as InstalledMap);
  assert.equal(changed, true);
  assert.equal("osionos.draw" in map, false);
  assert.deepEqual(map["osionos.whiteboard"], {
    ...draw,
    identifier: "osionos.whiteboard",
    title: "Whiteboard",
    icon: "icon:pen-tool",
    launchKind: "embed",
    launchUrl: "https://localhost:3007",
  });
  assert.equal(map["osionos.mail"], mail);
});

test("the migration is idempotent", () => {
  const once = migrateInstalledMap({ "osionos.draw": draw } as InstalledMap);
  const twice = migrateInstalledMap(once.map);
  assert.equal(twice.changed, false);
  assert.equal(twice.map, once.map);
});

test("a map without Draw is returned untouched", () => {
  const input = { "osionos.mail": mail } as InstalledMap;
  const { map, changed } = migrateInstalledMap(input);
  assert.equal(changed, false);
  assert.equal(map, input);
});

test("when both exist the whiteboard entry wins and Draw is dropped", () => {
  const whiteboard = { ...draw, identifier: "osionos.whiteboard", title: "Whiteboard", active: true };
  const { map, changed } = migrateInstalledMap({ "osionos.draw": draw, "osionos.whiteboard": whiteboard } as InstalledMap);
  assert.equal(changed, true);
  assert.equal(map["osionos.whiteboard"], whiteboard);
  assert.equal("osionos.draw" in map, false);
});
