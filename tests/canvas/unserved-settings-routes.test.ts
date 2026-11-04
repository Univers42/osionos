// #293: four settings stores call routes no bridge mounts (billing, import history, page
// notification overrides, the settings audit). Each call was a 404, and Chrome logs every 404
// as a console error: opening Settings > Billing, Plans or Import, changing a page's
// notifications, or any audited settings action. The stores already stay local when the route
// is missing; now they do so without asking.

import "./support/stub-bridge.ts";
import "./support/emails-env.ts";

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { withBridge } from "./support/stub-bridge.ts";

const { isUnservedSettingsRoute, UNSERVED_SETTINGS_ROUTES } = await import("../../src/store/settings/unservedSettingsRoutes.ts");
const utils = await import("../../src/store/settings/settingsStoreUtils.ts");

const UNSERVED = ["/api/workspaces/ws-1/billing", "/api/workspaces/ws-1/billing/invoices", "/api/imports", "/api/notifications/pages/p-1", "/api/settings/actions"];

test("the listed routes match, and a served neighbour does not", () => {
  for (const path of UNSERVED) assert.equal(isUnservedSettingsRoute(path), true, path);
  for (const path of ["/api/workspaces/ws-1/settings", "/api/notifications/inbox", "/api/account/settings", "/api/imports-x"]) {
    assert.equal(isUnservedSettingsRoute(path), false, path);
  }
});

test("a settings helper answers null for an unserved route without a request", async () => {
  const calls = await withBridge(() => ({ status: 404, body: {} }), async () => {
    assert.equal(await utils.trySettingsGet("/api/imports"), null);
    assert.equal(await utils.trySettingsPatch("/api/workspaces/ws-1/billing", {}), null);
    assert.equal(await utils.trySettingsPut("/api/notifications/pages/p-1", {}), null);
    assert.equal(await utils.trySettingsDelete("/api/notifications/pages/p-1"), null);
    assert.equal(await utils.trySettingsPost("/api/settings/actions", {}), null);
  });
  assert.deepEqual(calls, []);
});

// Caveat: a text search of scripts/ for each route's distinctive segment. It catches the day the
// bridge mounts one of them (the entry must then go), but a route spelled differently there
// (a regex, a template) is missed, and a comment naming the path counts as served.
test("no bridge module mounts a listed route yet", () => {
  const scripts = new URL("../../scripts/", import.meta.url);
  const source = readdirSync(scripts).filter((name) => name.endsWith(".mjs"))
    .map((name) => readFileSync(new URL(name, scripts), "utf8").replaceAll("\\/", "/")).join("\n");
  for (const route of UNSERVED_SETTINGS_ROUTES) {
    assert.equal(source.includes(route.marker), false, `the bridge now names ${route.marker}: remove it from the list`);
  }
});
