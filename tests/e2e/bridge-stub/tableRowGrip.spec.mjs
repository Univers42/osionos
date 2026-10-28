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
