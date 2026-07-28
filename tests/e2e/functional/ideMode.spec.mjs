/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideMode.spec.mjs                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P0/P1: the dedicated IDE layout + file-explorer CRUD. Drives the real path —
// enable the osio.ide flag, flip the workspace into IDE mode from the sidebar,
// create a code file (a page with surface:"code"), confirm it opens the code
// editor, switch panels, and exit back to the normal workspace.

import { expect, test } from "@playwright/test";

async function bootWithFlag(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem("osio.ide", "1"); } catch { /* ignore */ }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

async function enterIdeMode(page) {
  const toggle = page.getByRole("button", { name: /IDE Workspace/i });
  await toggle.waitFor({ state: "visible", timeout: 15_000 });
  await toggle.click();
  await page.locator("[data-osio-ide-shell]").waitFor({ timeout: 10_000 });
}

test("the flag is a hard gate: no IDE affordance when osio.ide is off", async ({ page }) => {
  test.setTimeout(90_000); // first navigation pays the cold Vite compile
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Settings/i }).first().waitFor({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /IDE Workspace/i })).toHaveCount(0);
  await expect(page.locator("[data-osio-ide-shell]")).toHaveCount(0);
});

test("enter IDE mode, create a code file, switch panels, and exit", async ({ page }) => {
  test.setTimeout(90_000);
  await bootWithFlag(page);
  await enterIdeMode(page);
  const shell = page.locator("[data-osio-ide-shell]");
  await expect(shell).toBeVisible();

  // New file via the explorer toolbar → inline input → name it.
  await shell.getByRole("button", { name: "New file" }).click();
  const nameInput = shell.locator('input[placeholder="file name"]');
  await nameInput.waitFor();
  await nameInput.fill("hello.py");
  await nameInput.press("Enter");

  // It appears in the tree AND opens as a CodeMirror code surface (surface:"code"
  // dispatch through PaneContent), proving the whole page→file wiring.
  await expect(shell.getByRole("treeitem").getByText("hello.py", { exact: true })).toBeVisible();
  await expect(page.locator("[data-osio-ide]").first()).toBeVisible({ timeout: 12_000 });

  // Switch to the Search panel (activity bar) → its input renders.
  await shell.getByRole("button", { name: "Search", exact: true }).click();
  await expect(shell.getByPlaceholder("Search code files")).toBeVisible();

  // Exit IDE mode → the shell unmounts and the normal workspace returns.
  await shell.getByRole("button", { name: "Exit IDE mode" }).click();
  await expect(page.locator("[data-osio-ide-shell]")).toHaveCount(0);
});
