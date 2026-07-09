/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   databaseFormulaSugar.spec.mjs                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          #+#    #+#             */
/*   Created: 2026/07/08 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/08 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Excel-style "=" formulas compute end-to-end: the leading "=" is stripped,
// UPPER folds to upper, "&" concatenates, IF/>= work — the live preview and the
// saved cell both show the computed value, proving the sugar is wired globally
// through the one engine bridge.

import { test, expect } from "@playwright/test";

import { addPropertyOfType, insertInlineDatabase } from "../support/databaseHelpers.mjs";

test.describe("database-formula-sugar", () => {
  test("an Excel '=' formula previews and saves its computed value", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();
    await block.getByRole("button", { name: "New", exact: true }).last().click();
    await addPropertyOfType(block, page, "Formula", "Calc");

    // Open the formula editor from the (empty) formula cell.
    const formulaCell = block.locator('button[title="Click to edit formula"]').first();
    await formulaCell.click();
    const editor = page.getByPlaceholder("Your formula");
    await editor.waitFor({ timeout: 5_000 });

    // A compound Excel expression: leading "=", UPPER→upper, "&"→+, IF/>=.
    await editor.fill('=UPPER("ok") & IF(2 >= 1, "!", "?")');

    // The live preview computes it (WASM engine, via the desugar bridge).
    await expect(page.getByText("OK!", { exact: true })).toBeVisible({ timeout: 10_000 });

    // Saving persists the raw "=" text but the cell renders the computed value.
    await page.getByRole("button", { name: "Done" }).click();
    await expect(formulaCell).toHaveText(/OK!/);
  });
});
