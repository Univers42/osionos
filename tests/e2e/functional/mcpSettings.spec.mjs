/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mcpSettings.spec.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Proves the osionos MCP settings panel (1) renders instead of blanking — the
// reported bug, whose root cause was a zustand-v5 fresh-default render loop —
// and (2) that connect / manage / restrict / disconnect-all actually work end
// to end, since there is no real external OAuth to lean on.

import { expect, test } from "@playwright/test";

import { openFreshPage } from "../../browser/core/app.mjs";

async function openMcpSettings(page, baseURL) {
  await openFreshPage(page, baseURL);
  await page.getByRole("button", { name: "Settings", exact: true }).first().click();
  // Settings nav items are role="tab", not buttons.
  await page.getByRole("tab", { name: "osionos MCP" }).click();
  // The panel must actually mount (it used to blank on an unpersisted workspace).
  await expect(page.getByTestId("mcp-panel")).toBeVisible();
}

/** The Discover/Manage MiniTabs live INSIDE the panel — scope so we never hit a settings nav tab. */
function panelTab(page, name) {
  return page.getByTestId("mcp-panel").getByRole("tab", { name });
}

test.describe("osionos MCP settings", () => {
  test("panel renders and connect → manage → restrict → disconnect-all all work", async ({ page, baseURL }) => {
    await openMcpSettings(page, baseURL);

    // (1) Not blank: the master card heading and the Discover catalog are present.
    await expect(page.getByRole("heading", { level: 4, name: "Connect osionos to your AI tools" })).toBeVisible();
    const claude = page.getByTestId("mcp-app-toggle-claude");
    await expect(claude).toBeVisible();

    // (2) Connect an app from Discover.
    await expect(claude).toHaveText("Connect");
    await claude.click();
    await expect(claude).toHaveText("Connected");

    // (3) Manage tab reflects it: 1 connected.
    await panelTab(page, /Manage/).click();
    await expect(page.getByTestId("mcp-connected-count")).toHaveText("1");

    // (4) Restrict members to "No apps" → a not-yet-connected app can't be connected.
    await page.getByTestId("mcp-restrict-policy").selectOption("none");
    await panelTab(page, /Discover/).click();
    await expect(page.getByTestId("mcp-app-toggle-github")).toBeDisabled();

    // (5) Disconnect all users → back to 0 connected.
    await panelTab(page, /Manage/).click();
    await page.getByTestId("mcp-disconnect-all").click();
    await expect(page.getByTestId("mcp-disconnect-all-confirm")).toBeVisible();
    await page.getByTestId("mcp-disconnect-all-confirm-btn").click();
    await expect(page.getByTestId("mcp-connected-count")).toHaveText("0");
  });

  test("approved-only policy gates connect to the allowlist", async ({ page, baseURL }) => {
    await openMcpSettings(page, baseURL);

    // Switch to approved-only and approve just Claude.
    await panelTab(page, /Manage/).click();
    await page.getByTestId("mcp-restrict-policy").selectOption("approved");
    await expect(page.getByTestId("mcp-approved-list")).toBeVisible();
    await page.getByRole("switch", { name: "Approve Claude" }).click();

    // Discover: Claude is connectable, a non-approved app is not.
    await panelTab(page, /Discover/).click();
    await expect(page.getByTestId("mcp-app-toggle-chatgpt")).toBeDisabled();
    const claude = page.getByTestId("mcp-app-toggle-claude");
    await expect(claude).toBeEnabled();
    await claude.click();
    await expect(claude).toHaveText("Connected");
  });
});
