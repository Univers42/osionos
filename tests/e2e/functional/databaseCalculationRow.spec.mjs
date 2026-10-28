/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseCalculationRow.spec.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/28 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/28 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The Calculate row under a table shows its labels on hover only. Its cells
// drew the column lines, so a reader saw a stray 33 px line under New
// (reported 2026-10-28).

import { expect, test } from "@playwright/test";

import { insertInlineDatabase } from "../support/databaseHelpers.mjs";

test("the Calculate row draws no column lines", async ({ page }) => {
  const block = await insertInlineDatabase(page);
  const cells = block.locator("tfoot td");
  await expect(cells.first()).toBeAttached();
  const borders = await cells.evaluateAll((tds) => tds.map((td) => getComputedStyle(td).borderRightWidth));
  expect(new Set(borders)).toEqual(new Set(["0px"]));
});
