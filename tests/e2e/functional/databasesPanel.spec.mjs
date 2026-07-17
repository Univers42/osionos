/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databasesPanel.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*                                                +#+#+#+#+#+   +#+           */
/* ************************************************************************** */

// Databases navigator (left rail) — proves the panel renders the FULL bridge
// registry list and never silently degrades to the VITE_BAAS_LIVE_MOUNTS mock
// subset, and that a registry failure shows an ERROR (not mocks).
//
// NOTE: the default Playwright harness builds OFFLINE (VITE_API_URL=''), so the
// catalog takes its offline branch and never calls /api/databases — these specs
// then SKIP. Run against an ONLINE build (VITE_API_URL set, e.g. the real :3001
// or a `--mode dev` config) to exercise the route-mocked registry path.

import { test, expect } from "@playwright/test";

const FULL_LIST = [
  { dbId: "8e08344a-3182-425d-b802-326610e38dba", name: "osionos-restaurant", engine: "postgresql" },
  { dbId: "11111111-0000-4000-a000-000000000002", name: "osionos-finance", engine: "postgresql" },
  { dbId: "11111111-0000-4000-a000-000000000003", name: "osionos-iot", engine: "mongodb" },
  { dbId: "42c85133-c805-40c5-a260-04251834a337", name: "mongo-activity", engine: "mongodb" },
  { dbId: "028b32b2-78f2-405f-81e3-fa690c4649dc", name: "mysql-ops", engine: "mysql" },
  { dbId: "59939f19-7e8d-4876-a57f-61b3e7bb37be", name: "pg-commerce", engine: "postgresql" },
  { dbId: "11111111-0000-4000-a000-000000000007", name: "agency-db", engine: "postgresql" },
];

async function openPanel(page) {
  await page.goto("/");
  // The sidebar loads EXPANDED (Explorer panel) by default — the rail icon
  // column only becomes visible/actionable once collapsed (ActivitySidebar.tsx
  // crossfade: `visibility:hidden` while sidebarMode==='panel'). Collapse first.
  await page.getByRole("button", { name: "Toggle sidebar" }).click();
  const railIcon = page.locator('[aria-label="Databases"]').first();
  await railIcon.waitFor({ timeout: 20_000 });
  await railIcon.click();
  // DatabasesPanel is React.lazy + loads its catalog async. Wait for it to MOUNT
  // and leave the "loading" state, so the offline/online branch below is read
  // from a SETTLED status (an immediate .count() raced the lazy mount → the
  // guard read 0 and fell through into the online-only assertions).
  await page.getByLabel("Search databases and tables").waitFor({ timeout: 20_000 });
  await expect(page.getByText(/Connecting to your databases/)).toHaveCount(0);
}

/** True when the build is offline (no bridge) → the panel can't reach the registry. */
async function isUnconfigured(page) {
  return (await page.getByText(/aren.t configured/i).count()) > 0;
}

test.describe("databases-navigator", () => {
  test("renders every registry database, never just the mock subset", async ({ page }) => {
    await page.route("**/api/databases?*", (route) => route.fulfill({ json: { databases: FULL_LIST } }));
    await page.route("**/api/databases/*/schema", (route) =>
      route.fulfill({ json: { tables: [{ name: "t1", primary_key: ["id"], columns: [{ name: "id" }] }], engine: "postgresql" } }),
    );
    await openPanel(page);
    test.skip(await isUnconfigured(page), "offline build (VITE_API_URL unset) — run online to exercise the registry path");

    // All seven registry databases must be visible — including the registry-only
    // ones that the 3-entry mock fallback would have hidden.
    for (const db of FULL_LIST) {
      await expect(page.getByText(db.name, { exact: true })).toBeVisible({ timeout: 15_000 });
    }
    await expect(page.getByText("osionos-restaurant", { exact: true })).toBeVisible();
    await expect(page.getByText("agency-db", { exact: true })).toBeVisible();
  });

  test("a registry failure surfaces an error, not the mock mounts", async ({ page }) => {
    await page.route("**/api/databases?*", (route) =>
      route.fulfill({ status: 503, json: { ok: false, message: "registry unavailable" } }),
    );
    await openPanel(page);
    test.skip(await isUnconfigured(page), "offline build — run online to exercise the registry path");

    await expect(page.getByText(/Couldn.t load your databases/i)).toBeVisible({ timeout: 15_000 });
    // The mock-only names must NOT be presented as the database list on error.
    await expect(page.getByText("pg-commerce", { exact: true })).toHaveCount(0);
  });
});
