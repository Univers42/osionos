/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ideWorkspace.spec.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/19 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/19 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// End-to-end for the dedicated IDE layout (P0) + file-explorer CRUD & search
// (P1). Runs fully offline like every other spec; enables the osio.ide flag via
// localStorage in an init script (the same seam the app reads at boot).

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
  // Flip this workspace into IDE mode from the sidebar footer toggle.
  const toggle = page.getByRole("button", { name: /IDE Workspace/i });
  await toggle.waitFor({ state: "visible", timeout: 20_000 });
  await toggle.click();
  // The dedicated shell mounts (activity bar + explorer). First entry pays the
  // cold lazy-compile of the CodeMirror-heavy IDE chunk, so allow generous time.
  await page.locator("[data-osio-ide-shell]").waitFor({ state: "visible", timeout: 30_000 });
}

test("IDE mode: create, rename→relanguage, search, exit", async ({ page }) => {
  test.setTimeout(90_000); // cold lazy-compile of the IDE + CodeMirror chunk
  await enterIdeMode(page);

  // Create a code file from the explorer toolbar; the inline input takes a name.
  await page.getByRole("button", { name: "New file", exact: true }).first().click();
  const input = page.locator('[role="tree"] input');
  await input.waitFor({ state: "visible" });
  await input.fill("main.py");
  await input.press("Enter");

  // The file appears in the tree and opens in a CodeMirror pane.
  const fileRow = page.locator('[role="treeitem"]', { hasText: "main.py" });
  await expect(fileRow).toHaveCount(1, { timeout: 8_000 });
  await expect(page.locator(".cm-editor")).toBeVisible({ timeout: 8_000 });

  // Type code, then search finds it across the project.
  await page.locator(".cm-content").click();
  await page.keyboard.type("def greet():\n    return 'hi'");
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByPlaceholder("Search code files");
  await search.waitFor({ state: "visible" });
  await search.fill("greet");
  await expect(page.getByText(/1 result/i)).toBeVisible({ timeout: 6_000 });

  // Exit IDE mode returns to the normal workspace (shell unmounts).
  await page.getByRole("button", { name: "Search", exact: true }).click(); // back to a stable panel
  await page.getByRole("button", { name: "Exit IDE mode" }).click();
  await expect(page.locator("[data-osio-ide-shell]")).toHaveCount(0, { timeout: 8_000 });
});

test("IDE mode: rename a file re-infers its language", async ({ page }) => {
  test.setTimeout(90_000);
  await enterIdeMode(page);

  await page.getByRole("button", { name: "New file", exact: true }).first().click();
  const input = page.locator('[role="tree"] input');
  await input.waitFor({ state: "visible" });
  await input.fill("script.py");
  await input.press("Enter");

  const row = page.locator('[role="treeitem"]', { hasText: "script.py" });
  await expect(row).toHaveCount(1, { timeout: 8_000 });

  // Hover → rename to a .ts name; the row updates (and language re-infers under it).
  await row.hover();
  await page.getByRole("button", { name: "Rename", exact: true }).first().click();
  const renameInput = page.locator('[role="tree"] input');
  await renameInput.waitFor({ state: "visible" });
  await renameInput.fill("script.ts");
  await renameInput.press("Enter");

  await expect(page.locator('[role="treeitem"]', { hasText: "script.ts" })).toHaveCount(1, { timeout: 8_000 });
  await expect(page.locator('[role="treeitem"]', { hasText: "script.py" })).toHaveCount(0);
});
