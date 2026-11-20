/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templatesPanel.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG_AA = ["wcag2a", "wcag2aa"];
const panel = (page) => page.locator('[data-sidebar-panel="templates"]');

async function openTemplates(page, baseURL) {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Templates", exact: true }).click();
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByRole("option").first()).toBeVisible();
}

async function searchAndClear(page) {
  const search = panel(page).getByRole("textbox", { name: "Search templates" });
  await search.fill("crm");
  await expect(panel(page).getByRole("option")).toHaveCount(1);
  await expect(panel(page).getByRole("option")).toContainText("CRM pipeline");
  await search.fill("");
}

async function checkRovingPreview(page) {
  const options = panel(page).getByRole("option");
  await options.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  const preview = panel(page).locator("[data-template-preview]");
  await expect(preview).toBeVisible();
  // The template renders its own title twice (heading + view tab), so the box's
  // whole text is the assertion, not an exact-text element match.
  await expect(preview).toContainText("Sprint board");
}

async function createDashboard(page) {
  const dashboard = panel(page).locator('[data-template-id="tpl:dashboard"]');
  await dashboard.focus();
  await page.keyboard.press("A");
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue("Dashboard");
}

async function violations(page) {
  const { violations: found } = await new AxeBuilder({ page })
    .withTags(WCAG_AA)
    .include('[data-sidebar-panel="templates"]')
    .analyze();
  return found.map((item) => `${item.id}: ${item.nodes.map((node) => `${node.target.join(" ")} ${node.failureSummary ?? ""}`).join(", ")}`);
}

test("browse, search, keyboard preview and New page use the catalogue", async ({ page, baseURL }) => {
  await openTemplates(page, baseURL);
  await searchAndClear(page);
  await checkRovingPreview(page);
  await createDashboard(page);
});

for (const theme of ["light", "dark"]) {
  test(`Templates panel has no WCAG A/AA violations in ${theme}`, async ({ page, baseURL }) => {
    await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
    await openTemplates(page, baseURL);
    expect(await violations(page)).toEqual([]);
  });
}
