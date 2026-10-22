/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   formulaBudget.spec.mjs                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// The formula VM's instruction budget reaches the browser. A normal formula
// still computes after the wasm rebuild — that is the proof the rebuilt pkg/
// loads and runs — and a formula whose work exceeds the budget stops with
// #BUDGET_EXCEEDED in the cell instead of burning the reader's CPU.

import { test, expect } from "@playwright/test";

import { addPropertyOfType, insertInlineDatabase } from "../support/databaseHelpers.mjs";

// A nested `map` over ten elements: the closure runs once per element, so the
// innermost body runs 10^depth times. Seven levels is ten million closure
// calls, far past the one-million-instruction budget. The formula is built
// here so the depth is visible in the test instead of hidden in a fixture.
const TEN = "[1,2,3,4,5,6,7,8,9,10]";
const NAMES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function nestedMapFormula(depth) {
  let expr = NAMES[depth - 1];
  for (let level = depth - 1; level >= 0; level -= 1) {
    expr = `map(${TEN}, ${NAMES[level]} => ${expr})`;
  }
  return expr;
}

const BOMB = nestedMapFormula(7);

test.describe("formula-budget", () => {
  test("a normal formula still computes after the wasm rebuild", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();
    await block.getByRole("button", { name: "New", exact: true }).last().click();
    await addPropertyOfType(block, page, "Formula", "Calc");

    const formulaCell = block.locator('button[title="Click to edit formula"]').first();
    await formulaCell.click();
    const editor = page.getByPlaceholder("Your formula");
    await editor.waitFor({ timeout: 5_000 });
    await editor.fill('=UPPER("ok") & IF(2 >= 1, "!", "?")');

    // The live preview computes it — the rebuilt wasm is loaded and running.
    await expect(page.getByText("OK!", { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Done" }).click();
    await expect(formulaCell).toHaveText(/OK!/);
  });

  test("a formula over the budget stops with the budget sentinel and the tab stays alive", async ({ page }) => {
    const block = await insertInlineDatabase(page);
    await block.hover();
    await block.getByRole("button", { name: "New", exact: true }).last().click();
    await addPropertyOfType(block, page, "Formula", "Bomb");

    const formulaCell = block.locator('button[title="Click to edit formula"]').first();
    await formulaCell.click();
    const editor = page.getByPlaceholder("Your formula");
    await editor.waitFor({ timeout: 5_000 });
    await editor.fill(BOMB);

    // The budget stops the evaluation instead of letting the tab burn CPU.
    await expect(page.getByText("#BUDGET_EXCEEDED", { exact: true }).first())
      .toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Done" }).click();
    await expect(formulaCell).toHaveText(/#BUDGET_EXCEEDED/);

    // The page is still responsive after the stop.
    await expect(page.getByRole("button", { name: "New", exact: true }).last()).toBeEnabled();
  });
});
