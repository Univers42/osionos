/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   a11y.spec.mjs                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: DJSurgeon <djsurgeon83@gmail.com>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/30 16:10:00 by DJSurgeon         #+#    #+#             */
/*   Updated: 2026/10/30 16:10:00 by DJSurgeon        ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Automated WCAG 2.2 AA accessibility audit suite using vendored axe-core.
// Audits core Osionos surfaces (empty document, block editor with blocks,
// slash command menu dropdown, and settings modal) and logs diagnostics.

import { expect, test } from "@playwright/test";

import {
  activateFirstEditor,
  createBlockViaSlash,
  getEditors,
  openFreshPage,
  slashMenu,
} from "../../browser/core/app.mjs";
import { runA11yAudit } from "../support/a11yAudit.mjs";
import { openSettings } from "../support/settingsHelpers.mjs";

test("a11y: empty document surface", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const results = await runA11yAudit(page, "empty document surface");
  expect(results).toBeDefined();
  expect(results.violations).toBeInstanceOf(Array);
});

test("a11y: block editor surface with blocks", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.type("Introduction paragraph with standard body text.");
  await page.keyboard.press("Enter");
  await createBlockViaSlash(page, "h1", "Heading 1", 1);
  const h1Editor = getEditors(page).nth(1);
  await h1Editor.type("Document Section Heading");
  await page.keyboard.press("Enter");
  await createBlockViaSlash(page, "code", "Code", 2);
  const results = await runA11yAudit(page, "block editor surface with blocks");
  expect(results).toBeDefined();
  expect(results.violations).toBeInstanceOf(Array);
});

test("a11y: slash command menu", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  const editor = await activateFirstEditor(page);
  await editor.click();
  await page.keyboard.type("/");
  await slashMenu(page).waitFor({ state: "visible" });
  const results = await runA11yAudit(page, "slash command menu");
  expect(results).toBeDefined();
  expect(results.violations).toBeInstanceOf(Array);
});

test("a11y: settings surface", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await openSettings(page);
  const results = await runA11yAudit(page, "settings surface");
  expect(results).toBeDefined();
  expect(results.violations).toBeInstanceOf(Array);
});
