/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseMapView.spec.mjs                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 12:00:00 by dlesieur          #+#    #+#             */
/*                                                +#+#+#+#+#+   +#+           */
/* ************************************************************************** */

// Live-DB grid interpretation: a `city` text column (no coordinates) must render
// as a SELECT and the table must offer a MAP view that plots the geocoded city.
//
// NOTE: the default Playwright harness builds OFFLINE (VITE_API_URL=''), so the
// catalog takes its offline branch and never calls /api/databases — this spec
// then SKIPS. Run against an ONLINE build (VITE_API_URL set) to exercise it. The
// deterministic proof of the same logic is tests/canvas/live-place-pipeline.test.ts.

import { test, expect } from "@playwright/test";

const DB_ID = "rest-db-0001-4000-a000-000000000001";
const col = (name, normalized_type = "text") => ({
  name, native_type: normalized_type, normalized_type, nullable: true, default: null, enum_values: null, references: null, inferred: false,
});
const SCHEMA = {
  dbId: DB_ID,
  engine: "sqlite",
  capabilities: { introspect: true },
  tables: [{ name: "restaurant", primary_key: ["id"], columns: [col("id", "integer"), col("name"), col("cuisine"), col("city")] }],
};
const ROWS = [
  { id: 1, name: "Le Train Bleu", cuisine: "French", city: "Bordeaux" },
  { id: 2, name: "La Marseillaise", cuisine: "French", city: "Marseille" },
  { id: 3, name: "Bangkok House", cuisine: "Thai", city: "Paris" },
];

async function mockBridge(page) {
  await page.route("**/api/databases?*", (route) =>
    route.fulfill({ json: { databases: [{ dbId: DB_ID, name: "demo-restaurant", engine: "sqlite" }] } }),
  );
  await page.route("**/api/databases/*/schema", (route) => route.fulfill({ json: SCHEMA }));
  await page.route("**/api/databases/*/tables/*", (route) =>
    route.fulfill({ json: { rows: ROWS, affected_rows: ROWS.length } }),
  );
}
async function isUnconfigured(page) {
  return (await page.getByText(/aren.t configured/i).count()) > 0;
}

test("a city column renders as select + offers a Map view that plots the city", async ({ page }) => {
  await mockBridge(page);
  await page.goto("/");
  const rail = page.locator('[aria-label="Databases"]').first();
  await rail.waitFor({ timeout: 20_000 });
  await rail.click();
  test.skip(await isUnconfigured(page), "offline build (VITE_API_URL unset) — run online to exercise this");

  // Open the mount, then its table.
  await page.getByText("demo-restaurant", { exact: true }).click();
  await page.getByRole("button", { name: "restaurant" }).first().click();

  // The grid shows the cities (as select chips) and offers a Map view.
  await expect(page.getByText("Bordeaux").first()).toBeVisible({ timeout: 15_000 });
  const mapTab = page.getByRole("button", { name: /^Map$/ }).first();
  await expect(mapTab).toBeVisible({ timeout: 15_000 });

  // Opening the Map view renders a Leaflet map with markers.
  await mapTab.click();
  await expect(page.locator(".leaflet-container").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".leaflet-marker-icon").first()).toBeVisible({ timeout: 15_000 });
});
