/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mountSourceBadge.spec.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 01:10:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/30 01:10:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A live table's toolbar names where its data lives (O1): engine, host or file, TLS — from
// the bridge's credential-free descriptor (GET /api/databases/:dbId/descriptor). A failed
// descriptor says so instead of guessing.

import { test, expect } from "@playwright/test";

import { stubBridge } from "../support/bridgeStub.mjs";
import { openDatabasesPanel } from "../support/databasesPanel.mjs";

const DB_ID = "59939f19-7e8d-4876-a57f-61b3e7bb37be";
const column = (name, normalized_type) => ({
  name, native_type: normalized_type, normalized_type, nullable: name !== "id",
  default: null, enum_values: null, references: null, inferred: false,
});
const TABLE = { name: "orders", primary_key: ["id"], columns: [column("id", "integer"), column("label", "text")] };

function stubLiveTable(page, engine, descriptorAnswer) {
  const base = `/api/databases/${DB_ID}`;
  return stubBridge(page, (url, request) => {
    if (url.pathname === "/api/databases") return { json: { databases: [{ dbId: DB_ID, name: "shop", engine }] } };
    if (url.pathname === `${base}/schema`) return { json: { dbId: DB_ID, engine, capabilities: null, tables: [TABLE] } };
    if (url.pathname === `${base}/descriptor`) return descriptorAnswer;
    if (url.pathname === `${base}/tables/orders` && request.method() === "POST") {
      return { json: { rows: [{ id: 1, label: "first" }], next_cursor: null } };
    }
    return undefined;
  });
}

async function openOrders(page, baseURL) {
  await openDatabasesPanel(page, baseURL);
  await page.getByRole("button", { name: /^orders/ }).click();
}

test.describe("mount source badge (bridge stub)", () => {
  test("a network mount shows engine, host and verified TLS", async ({ page, baseURL }) => {
    await stubLiveTable(page, "postgresql", { json: { descriptor: {
      id: DB_ID, name: "shop", engine: "postgresql", location: "network",
      host: "db.internal", port: 5432, database: "shop", tls: "verify", credential_mode: "inline",
    } } });
    await openOrders(page, baseURL);
    const badge = page.getByRole("button", { name: /^Data source: / });
    await expect(badge).toHaveAccessibleName(
      "Data source: PostgreSQL · db.internal:5432/shop, TLS, certificate verified", { timeout: 15_000 });
    await badge.click();
    const details = page.getByRole("dialog", { name: "Data source" });
    await expect(details.getByText("inline", { exact: true })).toBeVisible();
  });

  test("the Source settings screen shows the binding, with nothing to edit", async ({ page, baseURL }) => {
    await stubLiveTable(page, "postgresql", { json: { descriptor: {
      id: DB_ID, name: "shop", engine: "postgresql", location: "network",
      host: "db.internal", port: 5432, database: "shop", tls: "verify", credential_mode: "inline",
    } } });
    await openOrders(page, baseURL);
    await page.getByRole("button", { name: "View settings" }).click();
    await page.getByRole("menuitem", { name: /^Source/ }).click();
    const binding = page.getByRole("region", { name: "Current connection" });
    await expect(binding).toContainText("PostgreSQL · db.internal:5432/shop", { timeout: 15_000 });
    await expect(binding).toContainText("TLS, certificate verified · credentials: inline");
    await expect(binding.locator("button, input, select, textarea")).toHaveCount(0);
  });

  test("a file mount shows its file and no TLS claim", async ({ page, baseURL }) => {
    await stubLiveTable(page, "sqlite", { json: { descriptor: {
      id: DB_ID, name: "shop", engine: "sqlite", location: "file", file: "/data/shop.db", tls: "n/a",
    } } });
    await openOrders(page, baseURL);
    await expect(page.getByRole("button", { name: /^Data source: / }))
      .toHaveAccessibleName("Data source: SQLite · /data/shop.db", { timeout: 15_000 });
  });

  test("a failed descriptor says the location is unavailable", async ({ page, baseURL }) => {
    await stubLiveTable(page, "postgresql", { status: 503, json: { ok: false } });
    await openOrders(page, baseURL);
    await expect(page.getByRole("button", { name: /^Data source: / }))
      .toHaveAccessibleName("Data source: Location unavailable", { timeout: 15_000 });
  });
});
