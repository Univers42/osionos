/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   layoutPanelScope.spec.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/13 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/13 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Regression: the canvas "Layout settings" panel used to be position:fixed at
// the VIEWPORT's left edge (top:0/bottom:0, above the popover layer). It
// covered the app sidebar, and — because workspace panes stay mounted in the
// background — an open panel survived switching to other pages and blocked
// the whole app ("customize header effect on all the files"). The panel must
// stay INSIDE the layout block that owns it and dismiss on any outside press.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  openSlashMenuFromEditor,
  slashCommandEntry,
} from "../../browser/core/app.mjs";
import { setupCanvasFlag } from "../../browser/core/layout.mjs";

async function createInlineLayout(page, appUrl) {
  await openFreshPage(page, appUrl);
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, "/layout");
  const entry = slashCommandEntry(page, "Layout inline").last();
  await entry.waitFor();
  await entry.evaluate((node) => node.click());
  await expect(page.locator(".osionos-layout-block")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await setupCanvasFlag(page);
});

test("layout settings panel stays scoped to its block and dismisses outside", async ({ page, baseURL }) => {
  await createInlineLayout(page, baseURL);

  const block = page.locator(".osionos-layout-block").first();
  const panel = page.locator(".osionos-layout-settings-panel");

  await page.getByRole("button", { name: "Layout settings" }).click();
  await expect(panel).toBeVisible();
  // The panel slides in via a 140ms CSS animation (osionos-layout-panel-slide-in,
  // notionPage.css) starting from translateX(-100%); `toBeVisible` resolves as
  // soon as it mounts, mid-animation, so a boundingBox() read here would race
  // the slide and catch it near its off-canvas starting position. Wait for the
  // animation to actually finish before measuring geometry.
  await panel.evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));

  // Scoped, not viewport-fixed: the panel is contained by its layout block
  // (small slack for the border/close-tab overhang), so it can never cover
  // the sidebar or another pane's page.
  const blockBox = await block.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(panelBox.x).toBeGreaterThanOrEqual(blockBox.x - 24);
  expect(panelBox.y).toBeGreaterThanOrEqual(blockBox.y - 8);
  expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(blockBox.y + blockBox.height + 8);
  // The old fixed panel sat at the viewport origin, over the sidebar.
  expect(panelBox.x).toBeGreaterThan(100);
  expect(panelBox.y).toBeGreaterThan(40);

  // A press anywhere outside the block dismisses the panel, so a forgotten
  // panel can never linger over other pages (panes stay mounted).
  await page.mouse.click(blockBox.x + blockBox.width / 2, Math.max(8, blockBox.y - 80));
  await expect(panel).toBeHidden();
});
