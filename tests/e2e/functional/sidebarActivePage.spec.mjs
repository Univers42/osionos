// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   sidebarActivePage.spec.mjs                         :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/13 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/13 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// The explorer marks exactly one row as the open page, and the mark follows navigation.
// Rows learn this from a keyed subscription (src/store/activePageFlag.ts), not a prop.

import { test, expect } from "@playwright/test";

import { explorerRow } from "../../browser/core/app.mjs";

const currentRows = (page) => page.getByRole("treeitem", { selected: true });

test("the open page's tree row is the only one marked current, and the mark follows navigation", async ({ page, baseURL }) => {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });

  await explorerRow(page, "Getting Started").click();
  await expect(currentRows(page)).toHaveCount(1);
  await expect(currentRows(page)).toContainText("Getting Started");

  await explorerRow(page, "Project Roadmap").click();
  await expect(currentRows(page)).toHaveCount(1);
  await expect(currentRows(page)).toContainText("Project Roadmap");
});
