/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databasesPanel.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 00:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 00:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Databases navigator (left rail) against a stubbed bridge (PLAYWRIGHT_BRIDGE_STUB=1, the only
// build with a bridge URL): the panel lists the FULL registry, never the VITE_BAAS_LIVE_MOUNTS
// mock subset, and a registry failure is an error, not mocks. The offline build's "not
// configured" state is in functional/databasesPanel.spec.mjs.

import { test, expect } from "@playwright/test";

import { stubBridge } from "../support/bridgeStub.mjs";
import { openDatabasesPanel } from "../support/databasesPanel.mjs";

const FULL_LIST = [
  { dbId: "8e08344a-3182-425d-b802-326610e38dba", name: "osionos-restaurant", engine: "postgresql" },
  { dbId: "11111111-0000-4000-a000-000000000002", name: "osionos-finance", engine: "postgresql" },
  { dbId: "11111111-0000-4000-a000-000000000003", name: "osionos-iot", engine: "mongodb" },
  { dbId: "42c85133-c805-40c5-a260-04251834a337", name: "mongo-activity", engine: "mongodb" },
  { dbId: "028b32b2-78f2-405f-81e3-fa690c4649dc", name: "mysql-ops", engine: "mysql" },
  { dbId: "59939f19-7e8d-4876-a57f-61b3e7bb37be", name: "pg-commerce", engine: "postgresql" },
  { dbId: "11111111-0000-4000-a000-000000000007", name: "agency-db", engine: "postgresql" },
];
const SCHEMA = { tables: [{ name: "t1", primary_key: ["id"], columns: [{ name: "id" }] }], engine: "postgresql" };

function stubRegistry(page, listAnswer) {
  const state = { listCalls: 0 };
  return stubBridge(page, (url) => {
    if (url.pathname === "/api/databases") {
      state.listCalls += 1;
      return listAnswer;
    }
    return /^\/api\/databases\/[^/]+\/schema$/.test(url.pathname) ? { json: SCHEMA } : undefined;
  }).then(() => state);
}

test.describe("databases navigator (bridge stub)", () => {
  test("renders every registry database, never just the mock subset", async ({ page, baseURL }) => {
    const bridge = await stubRegistry(page, { json: { databases: FULL_LIST } });
    await openDatabasesPanel(page, baseURL);
    for (const db of FULL_LIST) {
      await expect(page.getByText(db.name, { exact: true })).toBeVisible({ timeout: 15_000 });
    }
    expect(bridge.listCalls).toBeGreaterThan(0);
  });

  test("a registry failure surfaces an error, not the mock mounts", async ({ page, baseURL }) => {
    await stubRegistry(page, { status: 503, json: { ok: false, message: "registry unavailable" } });
    await openDatabasesPanel(page, baseURL);
    await expect(page.getByText(/Couldn.t load your databases/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("pg-commerce", { exact: true })).toHaveCount(0);
  });
});
