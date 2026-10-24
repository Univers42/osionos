/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sysSavedViews.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P4-1-c: a view added on a `sys:` source is saved for the user through the bridge; the
// rows and the default view are never sent. Runs with PLAYWRIGHT_BRIDGE_STUB=1.

import { test, expect } from "@playwright/test";

import { addView } from "../support/databaseHelpers.mjs";
import { openSysDatabase, stubSysViews } from "../support/sysViewsBridge.mjs";

test.describe("sys saved views", () => {
  test("loading and reading saves nothing", async ({ page, baseURL }) => {
    const bridge = await stubSysViews(page);
    await openSysDatabase(page, baseURL);
    await page.waitForTimeout(800);
    expect(bridge.puts).toEqual([]);
    expect(bridge.deletes).toEqual([]);
  });

  test("a new view is PUT once with the session token and no rows, and survives a reload", async ({ page, baseURL }) => {
    const bridge = await stubSysViews(page);
    const block = await openSysDatabase(page, baseURL);
    await addView(block, page, "Table");
    await expect.poll(() => bridge.puts.length).toBe(1);
    const [put] = bridge.puts;
    expect(put.id).toMatch(/^[\w-]+$/);
    expect(put.auth).toBe("Bearer e2e-page-jwt");
    expect(Object.keys(put.body)).not.toEqual(expect.arrayContaining(["pages", "rows", "id", "databaseId"]));
    expect(JSON.stringify(put.body)).not.toMatch(/Alpha|Beta/);
    await page.reload({ waitUntil: "domcontentloaded" });
    const again = await openSysDatabase(page, baseURL);
    await expect(again.getByText("Table", { exact: true })).toHaveCount(1);
    expect(bridge.puts).toHaveLength(1);
  });

  test("a refused save (422) says so and keeps the view on screen", async ({ page, baseURL }) => {
    const bridge = await stubSysViews(page, { saveStatus: 422 });
    const block = await openSysDatabase(page, baseURL);
    await addView(block, page, "Table");
    await expect.poll(() => bridge.puts.length).toBe(1);
    await expect(page.getByText(/Could not save this view/)).toBeVisible();
    await expect(block.getByText("Table", { exact: true })).toHaveCount(1);
  });
});
