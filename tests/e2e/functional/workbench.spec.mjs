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

// The unified workbench behind osio.workbench: grid + resizable dock + one
// status bar. Offline build, so the sandbox chip shows its honest non-online state.

import { expect, test } from "@playwright/test";

async function bootWorkbench(page) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  // Failed-resource noise is the offline build having no bridge, not a UI error.
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/Failed to load resource|ERR_|net::/i.test(msg.text())) errors.push(msg.text());
  });
  await page.addInitScript(() => {
    try { localStorage.setItem("osio.workbench", "1"); } catch { /* ignore */ }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
  return errors;
}

test("grid and status bar render; sandbox state is named", async ({ page }) => {
  test.setTimeout(120_000); // cold Vite compile of the workbench chunk
  const errors = await bootWorkbench(page);
  await expect(page.getByTestId("workbench-grid")).toBeVisible();
  await expect(page.getByTestId("workbench-statusbar")).toBeVisible();
  await expect(page.getByTestId("sandbox-chip")).toHaveText(/Sandbox: (checking|online|stopped|disabled|unavailable)/);
  expect(errors).toEqual([]);
});

test("Ctrl+J toggles the dock; tabs and splitter work by keyboard", async ({ page }) => {
  test.setTimeout(120_000);
  const errors = await bootWorkbench(page);
  const dock = page.getByTestId("workbench-dock");
  await expect(dock).toHaveCount(0);
  await page.keyboard.press("Control+j");
  await expect(dock).toBeVisible();

  const terminal = page.getByRole("tab", { name: "Terminal" });
  await expect(terminal).toHaveAttribute("aria-selected", "true");
  await terminal.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Problems" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Ports" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(terminal).toHaveAttribute("aria-selected", "true");

  const splitter = page.getByRole("separator", { name: "Resize panel" });
  const before = Number(await splitter.getAttribute("aria-valuenow"));
  await splitter.focus();
  await page.keyboard.press("ArrowUp");
  await expect(splitter).toHaveAttribute("aria-valuenow", String(before + 16));

  await page.keyboard.press("Control+j");
  await expect(dock).toHaveCount(0);
  expect(errors).toEqual([]);
});
