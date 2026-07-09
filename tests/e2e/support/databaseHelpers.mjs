/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseHelpers.mjs                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shared harness for inline-database specs: insert a /database block and add
// properties through the real UI (robust to the rename-panel auto-open).

import { expect } from "@playwright/test";

import {
  activateFirstEditor,
  openFreshPage,
  openSlashMenuFromEditor,
  slashCommandEntry,
} from "../../browser/core/app.mjs";

export async function insertInlineDatabase(page) {
  await openFreshPage(page, "/");
  const editor = await activateFirstEditor(page);
  await openSlashMenuFromEditor(editor, "/database");
  await slashCommandEntry(page, "Database - Inline").click();
  const block = page.locator(".osionos-database-block--inline").first();
  await block.waitFor({ timeout: 15_000 });
  return block;
}

/** Adds a property of the given type-picker label, named `name`. Adding
 *  auto-opens the property config panel to rename (Notion parity) — type the
 *  name, commit, close the panel. */
export async function addPropertyOfType(block, page, typeLabel, name) {
  await block.locator('[aria-label="Add property"]').click();
  await page.getByText(typeLabel, { exact: true }).click();
  const nameBox = page.getByRole("textbox", { name: "Property name" });
  await nameBox.waitFor({ timeout: 5_000 });
  await nameBox.fill(name);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(block.locator("th", { hasText: name }).first()).toBeVisible();
}

export async function addTextProperty(block, page, name = "Notes") {
  await addPropertyOfType(block, page, "Text", name);
}

/** Create a new view of the given type via the portaled "Add a new view" panel
 *  (it renders outside the block, so it must be targeted on `page`). */
export async function addView(block, page, typeLabel) {
  await block.locator('[aria-label="Add view"]').click();
  const panel = page.getByTestId("add-view-panel");
  await panel.waitFor({ timeout: 10_000 });
  await panel.getByRole("button", { name: typeLabel, exact: true }).click();
}
