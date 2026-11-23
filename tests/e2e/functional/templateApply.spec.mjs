/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   templateApply.spec.mjs                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// "Apply to this page" from the Templates panel: Shift+A asks first (keep a
// copy / replace / cancel), an empty page applies without asking, and Escape
// leaves the page untouched.

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import {
  clearAndTypePageTitle,
  createParagraphs,
  explorerRow,
  getEditors,
  openFreshPage,
  openSlashMenuFromEditor,
  pressEnter,
  slashCommandEntry,
} from "../../browser/core/app.mjs";

const WCAG_AA = ["wcag2a", "wcag2aa"];

// The panel and its catalogue exist only with osio.layout.modes on (groot ADR 0067 RD7).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("osio.layout.modes", "1"));
});

const panel = (page) => page.locator('[data-sidebar-panel="templates"]');
const crmCard = (page) => panel(page).locator('[data-template-id="tpl:crm-pipeline"]');
const dialog = (page) => page.getByRole("dialog");
const crmHeading = (page) => page.locator("main .osio-h1").filter({ hasText: "CRM pipeline" });

async function openTemplatesPanel(page) {
  await page.getByRole("tab", { name: "Templates", exact: true }).click();
  await expect(panel(page).getByRole("option").first()).toBeVisible();
}

// The way databaseInlineHeader.spec.mjs materializes an inline table database.
async function addInlineDatabase(page) {
  const editor = getEditors(page).nth(1);
  await openSlashMenuFromEditor(editor, "/database");
  await slashCommandEntry(page, "Database - Inline").click();
  await page.locator(".osionos-database-block--inline").first().waitFor({ timeout: 15_000 });
}

// A page carrying a typed line and an inline database: apply must ask first.
async function pageWithLineAndDatabase(page, appUrl, title, line) {
  await openFreshPage(page, appUrl);
  await clearAndTypePageTitle(page, title);
  await createParagraphs(page, [line]);
  await pressEnter(getEditors(page).nth(0));
  await addInlineDatabase(page);
}

// CRM's text lives in nested cells; its root handle focuses the page editor
// that owns the apply snapshot instead of a cell's separate text history.
async function undoTemplateApply(page, line) {
  const handle = page.locator('main [data-testid="block-drag-handle"]').first();
  await handle.click();
  await page.keyboard.press("Escape");
  await handle.focus();
  await expect(handle).toBeFocused();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".osionos-page-body").getByText(line)).toBeVisible();
  await expect(crmHeading(page)).toHaveCount(0);
}

async function verifyKeptCopy(page, title, line) {
  await page.getByRole("tab", { name: "Explorer" }).click();
  const copy = explorerRow(page, `${title} (1)`);
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(getEditors(page).filter({ hasText: line })).toBeVisible();
}

test("Shift+A applies CRM to this page keeping a copy", async ({ page, baseURL }) => {
  const title = "Apply source";
  const line = `Ledger line ${Date.now()}`;
  await pageWithLineAndDatabase(page, baseURL, title, line);
  await openTemplatesPanel(page);
  const urlBefore = page.url();
  await crmCard(page).focus();
  await page.keyboard.press("Shift+A");
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: "Keep a copy and apply" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toHaveCount(0);
  expect(page.url()).toBe(urlBefore);
  await expect(crmHeading(page)).toBeVisible();
  await expect(page.getByText(line)).toHaveCount(0);
  await undoTemplateApply(page, line);
  await verifyKeptCopy(page, title, line);
});

test("an empty page applies with no dialog", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await openTemplatesPanel(page);

  await crmCard(page).focus();
  await page.keyboard.press("Shift+A");
  await expect(crmHeading(page)).toBeVisible();
  await expect(dialog(page)).toHaveCount(0);
});

test("Escape in the apply dialog leaves the page unchanged", async ({ page, baseURL }) => {
  const line = `Escape line ${Date.now()}`;
  await pageWithLineAndDatabase(page, baseURL, "Escape source", line);
  await openTemplatesPanel(page);

  await crmCard(page).focus();
  await page.keyboard.press("Shift+A");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);

  await expect(page.getByText(line)).toBeVisible();
  await expect(crmHeading(page)).toHaveCount(0);
  await page.getByRole("tab", { name: "Explorer" }).click();
  await expect(explorerRow(page, "Escape source (1)")).toHaveCount(0);
});

for (const theme of ["light", "dark"]) {
  test(`Apply dialog has no WCAG A/AA violations in ${theme}`, async ({ page, baseURL }) => {
    await page.addInitScript((mode) => localStorage.setItem("osionos:theme-mode", mode), theme);
    const line = `Axe line ${Date.now()}`;
    await openFreshPage(page, baseURL);
    await createParagraphs(page, [line]);
    await openTemplatesPanel(page);

    await crmCard(page).focus();
    await page.keyboard.press("Shift+A");
    await expect(dialog(page)).toBeVisible();
    const { violations: found } = await new AxeBuilder({ page })
      .withTags(WCAG_AA)
      .include('[role="dialog"]')
      .analyze();
    expect(found.map((item) => `${item.id}: ${item.nodes.map((node) => `${node.target.join(" ")} ${node.failureSummary ?? ""}`).join(", ")}`)).toEqual([]);
  });
}
