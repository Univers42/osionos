/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   editViewToggle.spec.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { expect, test } from "@playwright/test";

import { activateFirstEditor, openFreshPage } from "../../browser/core/app.mjs";

test("edit/view toggle switches a page between editable and locked", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await activateFirstEditor(page);
  const editButton = page.locator("button[aria-pressed]", { hasText: "Edit" });
  const bodyEditors = page.locator(".osionos-page-body [contenteditable=\"true\"]");

  await expect(editButton).toHaveAttribute("aria-pressed", "true");
  await expect(bodyEditors.first()).toBeVisible();
  expect(await bodyEditors.count()).toBeGreaterThan(0);

  await editButton.click();
  await expect(editButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".osionos-page--locked")).toBeVisible();
  await expect(page.locator(".osionos-page-body [contenteditable=\"true\"]")).toHaveCount(0);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(editButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".osionos-page--locked")).toBeVisible();
  // page menu shows Lock page checked
  await page.getByRole("button", { name: "Open page configuration" }).click();
  const lockItem = page.locator("button.osio-menu-item", { hasText: /Lock page/i }).first();
  await expect(lockItem.locator("svg.lucide-check")).toBeVisible();

  await editButton.click();
  await expect(editButton).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator(".osionos-page-body [contenteditable=\"true\"]").count()).toBeGreaterThan(0);
});

test("edit/view toggle is keyboard operable", async ({ page, baseURL }) => {
  await openFreshPage(page, baseURL);
  await activateFirstEditor(page);
  const editButton = page.locator("button[aria-pressed]", { hasText: "Edit" });
  await editButton.focus();
  await page.keyboard.press("Space");
  await expect(editButton).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Space");
  await expect(editButton).toHaveAttribute("aria-pressed", "true");
});
