// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   workbench.spec.mjs                                 :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// The unified workbench: grid + resizable dock + one
// status bar. Offline build: no hosted sandbox is configured, so the status bar names this
// computer, whose terminal the dock opens in place (33936941, de444432).

import { expect, test } from "@playwright/test";

async function bootWorkbench(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  // Failed-resource noise is the offline build having no bridge, not a UI error.
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/Failed to load resource|ERR_|net::/i.test(msg.text())) errors.push(msg.text());
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  return errors;
}

test("grid and status bar render; the status bar names this computer", async ({ page }) => {
  test.setTimeout(120_000); // cold Vite compile of the workbench chunk
  const errors = await bootWorkbench(page);
  await expect(page.getByTestId("workbench-grid")).toBeVisible();
  const statusBar = page.getByTestId("workbench-statusbar");
  await expect(statusBar).toBeVisible();
  await expect(statusBar.getByTestId("machine-chip")).toHaveText("This computer");
  // A disabled sandbox is not a state to show: the machine chip stands in its place.
  await expect(statusBar.getByTestId("sandbox-chip")).toHaveCount(0);
  await statusBar.getByTestId("machine-chip").click();
  await expect(page.getByRole("tablist", { name: "Panel tabs" }).getByRole("tab", { name: "Terminal" })).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
});

test("Ctrl+J toggles the dock; tabs and splitter work by keyboard", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await bootWorkbench(page);
  const dock = page.getByTestId("workbench-dock");
  await expect(dock).toHaveCount(0);
  await page.keyboard.press("Control+j");
  await expect(dock).toBeVisible();

  // The dock's own tablist: the activity rail beside the panel has a Problems tab too.
  const tabs = page.getByRole("tablist", { name: "Panel tabs" });
  const terminal = tabs.getByRole("tab", { name: "Terminal" });
  await expect(terminal).toHaveAttribute("aria-selected", "true");
  await terminal.focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: "Problems" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tabs.getByRole("tab", { name: "Ports" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(terminal).toHaveAttribute("aria-selected", "true");

  const splitter = page.getByRole("separator", { name: "Resize panel" });
  const before = Number(await splitter.getAttribute("aria-valuenow"));
  await splitter.focus();
  await page.keyboard.press("ArrowUp");
  await expect(splitter).toHaveAttribute("aria-valuenow", String(before + 16));

  // Since f84edb43 the dock is hidden, not unmounted, so its terminal's shell survives the toggle.
  await page.keyboard.press("Control+j");
  await expect(dock).toBeHidden();
  expect(errors).toEqual([]);
});
