// **************************************************************************** //
//                                                                              //
//                                                         :::      ::::::::    //
//    ideDock.spec.mjs                                   :+:      :+:    :+:    //
//                                                     +:+ +:+         +:+      //
//    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         //
//                                                 +#+#+#+#+#+   +#+            //
//    Created: 2026/07/28 00:00:00 by dlesieur          #+#    #+#              //
//    Updated: 2026/07/28 00:00:00 by dlesieur         ###   ########.fr        //
//                                                                              //
// **************************************************************************** //

// The VS Code-style bottom dock: five tabs over the real components. Offline
// build → the terminal shows its honest unavailable state; Ports shows the
// empty state; Output starts clean. No mocked panels.

import { expect, test } from "@playwright/test";

async function enterIdeMode(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("osio.ide", "1");
      localStorage.setItem("osio.ide.mode", JSON.stringify({ state: { byWorkspace: {}, activePanel: "explorer", bottomOpen: false }, version: 0 }));
    } catch {
      /* ignore */
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const toggle = page.getByRole("button", { name: /IDE Workspace/i });
  await toggle.waitFor({ state: "visible", timeout: 20_000 });
  await toggle.click();
  await page.locator("[data-osio-ide-shell]").waitFor({ state: "visible", timeout: 30_000 });
}

test("the dock opens with five tabs and the terminal's honest offline state", async ({ page }) => {
  test.setTimeout(90_000); // first navigation pays the cold Vite compile of the IDE chunk
  await enterIdeMode(page);
  await page.locator("[data-osio-ide-shell]").getByRole("button", { name: /^Terminal$/ }).click(); // status-bar toggle
  for (const label of ["Terminal", "Problems", "Output", "Debug Console", "Ports"]) {
    await expect(page.locator(`[data-dock-tab]`, { hasText: label }).first()).toBeVisible();
  }
  // Offline build: no bridge URL → the terminal reports unavailability honestly.
  // The lazy xterm chunk + suspense can be slow on a loaded machine.
  await expect(page.getByText(/enable the workspace sandbox/i)).toBeVisible({ timeout: 30_000 });
});

test("Output and Ports tabs render their real empty states; Debug is honest", async ({ page }) => {
  test.setTimeout(90_000);
  await enterIdeMode(page);
  await page.locator("[data-osio-ide-shell]").getByRole("button", { name: /^Terminal$/ }).click();
  await page.locator('[data-dock-tab="output"]').click();
  await expect(page.getByText(/No output yet/i)).toBeVisible();
  await page.locator('[data-dock-tab="ports"]').click();
  await expect(page.getByText(/Nothing listening|Checking sandbox/i)).toBeVisible();
  await page.locator('[data-dock-tab="debug"]').click();
  await expect(page.getByText(/debugger lands with the DAP client/i)).toBeVisible();
});

test("the explorer shows the SANDBOX root with its honest offline state", async ({ page }) => {
  test.setTimeout(90_000);
  await enterIdeMode(page);
  const root = page.locator("[data-sandbox-root]");
  await expect(root).toBeVisible();
  await root.click();
  await expect(page.getByText(/sandbox not connected/i)).toBeVisible({ timeout: 10_000 });
});

test("Ctrl+J toggles the dock inside the IDE shell", async ({ page }) => {
  test.setTimeout(90_000);
  await enterIdeMode(page);
  await page.keyboard.press("Control+KeyJ");
  await expect(page.locator('[data-dock-tab="terminal"]')).toBeVisible();
  await page.keyboard.press("Control+KeyJ");
  await expect(page.locator('[data-dock-tab="terminal"]')).toHaveCount(0);
});

test("the top-bar Terminal menu enters IDE mode with the dock open", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    try { localStorage.setItem("osio.ide", "1"); } catch { /* ignore */ }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const menubar = page.getByRole("navigation", { name: "Application menu" });
  await menubar.getByRole("button", { name: "Terminal" }).click();
  const items = ["New Terminal", "Split Terminal", "New Terminal Window", "Run Task", "Run Build Task",
    "Run Active File", "Run Selected Test", "Configure Tasks", "Configure Default Build Task"];
  for (const label of items) {
    // Accelerator hints ride the accessible name ("New Terminal ⌃`") — match
    // by prefix and take the first (list order disambiguates New Terminal vs
    // New Terminal Window).
    await expect(page.getByRole("menuitem", { name: label }).first()).toBeVisible();
  }
  await page.getByRole("menuitem", { name: "New Terminal" }).filter({ hasNotText: "Window" }).click();
  await expect(page.locator("[data-osio-ide-shell]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-dock-tab="terminal"]')).toBeVisible();
});

test("Run Build Task with nothing configured creates + opens tasks.json", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    try { localStorage.setItem("osio.ide", "1"); } catch { /* ignore */ }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const menubar = page.getByRole("navigation", { name: "Application menu" });
  await menubar.getByRole("button", { name: "Terminal" }).click();
  await page.getByRole("menuitem", { name: "Run Build Task", exact: true }).click();
  // No tasks configured → the config file is created from the template and opened.
  await expect(page.getByText("tasks.json").first()).toBeVisible({ timeout: 20_000 });
});
