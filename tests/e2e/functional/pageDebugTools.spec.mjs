/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageDebugTools.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ··· → Tools: page debug toggles. Each tool flips a data-debug-* attribute on
// the page root (CSS overlays) or mounts the JS HUD; toggles keep the menu
// open, persist, and turn fully off again.

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

test("debug tools toggle overlays on and off from the page ··· menu", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const pageRoot = page.locator(".osionos-page").first();

  await page.getByRole("button", { name: "Open page configuration" }).click();

  // CSS tools: outlines + surface tint stamp attributes on the page root.
  await page.getByTestId("debug-tool-outlines").click();
  await page.getByTestId("debug-tool-surfaces").click();
  await expect(pageRoot).toHaveAttribute("data-debug-outlines", "");
  await expect(pageRoot).toHaveAttribute("data-debug-surfaces", "");

  // JS tools: caret inspector, hover ruler and perf HUD all report live.
  await page.getByTestId("debug-tool-caret").click();
  await page.getByTestId("debug-tool-measure").click();
  await page.getByTestId("debug-tool-perf").click();
  await page.keyboard.press("Escape");
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("debugging");
  await expect(page.getByTestId("debug-caret-chip")).toBeVisible();
  await expect(page.getByTestId("debug-caret-chip")).toContainText("paragraph");
  await editor.hover();
  await expect(page.getByTestId("debug-ruler-chip")).toBeVisible();
  await expect(page.getByTestId("debug-ruler-chip")).toContainText("px");
  await expect(page.getByTestId("debug-perf-chip")).toContainText("fps", { timeout: 5000 });

  // Toggles are symmetric: everything off again, attributes and HUD gone.
  await page.getByRole("button", { name: "Open page configuration" }).click();
  await page.getByTestId("debug-tool-outlines").click();
  await page.getByTestId("debug-tool-surfaces").click();
  await page.getByTestId("debug-tool-caret").click();
  await page.getByTestId("debug-tool-measure").click();
  await page.getByTestId("debug-tool-perf").click();
  await expect(pageRoot).not.toHaveAttribute("data-debug-outlines", "");
  await expect(pageRoot).not.toHaveAttribute("data-debug-surfaces", "");
  await expect(page.getByTestId("debug-caret-chip")).toHaveCount(0);
  await expect(page.getByTestId("debug-perf-chip")).toHaveCount(0);
});
