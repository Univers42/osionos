/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   tableRowGrip.spec.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 23:30:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 23:30:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Without row numbers, a table row's drag grip floats in its first cell. It has a
// lane of its own there: it covered the first letters of the title before.

import { expect, test } from "@playwright/test";

import { stubBridge } from "../support/bridgeStub.mjs";
import { seedPage } from "../support/embedSeed.mjs";

test("a table row's drag grip never covers its first cell's text", async ({ page, baseURL }) => {
  await stubBridge(page, () => undefined);
  await seedPage(page, baseURL, [{ id: "tasks", type: "database_inline", content: "", databaseId: "db-tasks", viewId: "v-tasks-table" }]);
  const row = page.locator(".osionos-page tr[data-page-id]").first();
  await row.hover();
  const grip = row.getByRole("button", { name: "Drag to reorder record" });
  await expect(grip).toBeVisible();
  const gap = await grip.evaluate((button) => {
    const content = button.closest("td").firstElementChild.getBoundingClientRect();
    return content.left - button.getBoundingClientRect().right;
  });
  expect(gap).toBeGreaterThanOrEqual(2);
});

test("a table row's drag grip satisfies WCAG 2.2 target size (24x24px) and keyboard focusability", async ({ page, baseURL }) => {
  await stubBridge(page, () => undefined);
  await seedPage(page, baseURL, [{ id: "tasks", type: "database_inline", content: "", databaseId: "db-tasks", viewId: "v-tasks-table" }]);
  const row = page.locator(".osionos-page tr[data-page-id]").first();
  await row.hover();
  const grip = row.getByRole("button", { name: "Drag to reorder record" });
  await expect(grip).toBeVisible();
  const box = await grip.boundingBox();
  expect(box).toBeDefined();
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
  expect(await grip.getAttribute("tabindex")).toBe("0");
});

test("database view table header action buttons satisfy WCAG 2.2 target size (24x24px) and focus visibility", async ({ page, baseURL }) => {
  await stubBridge(page, () => undefined);
  await seedPage(page, baseURL, [{ id: "tasks", type: "database_inline", content: "", databaseId: "db-tasks", viewId: "v-tasks-table" }]);
  const addPropBtn = page.getByRole("button", { name: "Add property" });
  await expect(addPropBtn).toBeVisible();
  const addPropBox = await addPropBtn.boundingBox();
  expect(addPropBox).toBeDefined();
  expect(addPropBox.width).toBeGreaterThanOrEqual(24);
  expect(addPropBox.height).toBeGreaterThanOrEqual(24);
  await expect(addPropBtn).toHaveClass(/focus-visible:ring-2/);

  const colOptionsBtn = page.getByRole("button", { name: "Column options" });
  await expect(colOptionsBtn).toBeVisible();
  const colOptionsBox = await colOptionsBtn.boundingBox();
  expect(colOptionsBox).toBeDefined();
  expect(colOptionsBox.width).toBeGreaterThanOrEqual(24);
  expect(colOptionsBox.height).toBeGreaterThanOrEqual(24);
  await expect(colOptionsBtn).toHaveClass(/focus-visible:ring-2/);

  const colHeaderBtn = page.getByRole("button", { name: "Task Name", exact: true });
  await expect(colHeaderBtn).toBeVisible();
  await expect(colHeaderBtn).toHaveClass(/focus-visible:ring-2/);
});
