/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseViewOverlays.spec.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Overlays placed with window coordinates live under <body>. Inside the
// database, the host pane (`contain: paint`) or a layout cell (`transform`)
// becomes their containing block: the feed reader covered only that box, and
// the dashboard drop line landed shifted by the box's offset from the window.

import { test, expect } from "@playwright/test";

import { addView, insertInlineDatabase } from "../support/databaseHelpers.mjs";

/** Whether the element sits in a pane, and its box. */
async function placement(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { inPane: Boolean(el.closest("[data-osio-pane]")), box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
  });
}

async function databaseWithView(page, view) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const block = await insertInlineDatabase(page);
  await expect(block.getByText("Untitled Database").first()).toBeVisible({ timeout: 15_000 });
  await addView(block, page, view);
  return block;
}

test.describe("database-view-overlays", () => {
  test("the feed reader covers the whole window", async ({ page }) => {
    const block = await databaseWithView(page, "Feed");
    // The Read button only shows on hover; this test is about where the reader lands.
    await block.getByRole("button", { name: "Read article", exact: true }).first().evaluate((button) => button.click());
    const reader = page.locator('[role="dialog"][aria-modal="true"]').filter({ has: page.getByRole("button", { name: "Close reader" }) });
    await expect(reader).toBeVisible();
    expect(await placement(reader)).toEqual({ inPane: false, box: { left: 0, top: 0, right: 1440, bottom: 900 } });

    await page.keyboard.press("Escape");
    await expect(reader).toHaveCount(0);
  });

  test("the dashboard drop line is placed against the window, not the pane", async ({ page }) => {
    const block = await databaseWithView(page, "Dashboard");
    await block.getByRole("button", { name: /Edit layout/ }).click();
    await expect(block.locator("[data-dash-row]").first()).toBeVisible();
    const indicator = page.locator("[data-dash-drop-indicator]");
    await expect(indicator).toHaveCount(1);
    expect((await placement(indicator)).inPane).toBe(false);
  });
});
